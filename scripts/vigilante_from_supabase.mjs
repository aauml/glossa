// vigilante_from_supabase.mjs — que el sistema mire sus propias anomalías.
//
// El panel enseñaba el estado; nadie lo vigilaba. Seis elementos pasaron horas en
// error y el número falló dos domingos seguidos, y las dos cosas las descubrió
// Arturo preguntando. Un tablero que hay que mirar para enterarse no es
// vigilancia.
//
// Hace tres cosas, en este orden:
//   1. DETECTA lo que se desvía de lo normal.
//   2. RECUPERA lo que tiene forma conocida —un 429 no es un fallo, es esperar—.
//   3. ANOTA lo demás con su evidencia, para que la corrección se escriba con
//      datos y no con recuerdos.
//
// Lo que NO hace es tocar el código. Los once fallos de un solo día fueron
// condiciones mal escritas, y un sistema que reescribe su propio código sin que
// nadie lo lea se «arregla» volviéndose permisivo — que es justo el fallo que
// nadie ve.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GITHUB_TOKEN (opcional).

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GH = process.env.GITHUB_TOKEN || '';
const REPO = process.env.GITHUB_REPOSITORY || 'aauml/glossa';
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

const vistas = new Set();

/** Abre o refresca una incidencia. Una por clase y sujeto: veinte avisos del
 *  mismo problema no informan mejor que uno que diga desde cuándo pasa. */
async function anotar({ clase, sujeto = null, gravedad = 'aviso', detalle, evidencia = null, accion = null }) {
  vistas.add(`${clase}|${sujeto ?? ''}`);
  const previas = await sb(
    `glossa_radar_incidencias?select=id,created_at&abierta=is.true&clase=eq.${clase}` +
    (sujeto ? `&sujeto=eq.${encodeURIComponent(sujeto)}` : '&sujeto=is.null'));
  if (previas?.length) {
    const desde = Math.round((Date.now() - new Date(previas[0].created_at)) / 864e5);
    await sb(`glossa_radar_incidencias?id=eq.${previas[0].id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ vista_por_ultima_vez: new Date().toISOString(), detalle, evidencia, accion }),
    });
    console.log(`  · ${clase}${sujeto ? ` (${sujeto})` : ''} — sigue, desde hace ${desde} día(s)`);
  } else {
    await sb('glossa_radar_incidencias', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{ clase, sujeto, gravedad, detalle, evidencia, accion }]),
    });
    console.log(`  ${gravedad === 'grave' ? '✗' : '·'} ${clase}${sujeto ? ` (${sujeto})` : ''}: ${detalle}`);
    if (accion) console.log(`      hecho: ${accion}`);
  }
}

// ── Empezamos ──────────────────────────────────────────────────────────────
const ajustesRaw = await sb('glossa_radar_settings?select=key,value');
const ajus = Object.fromEntries((ajustesRaw ?? []).map(r => [r.key, r.value]));
const DIAS_MUDA = Number(ajus.vigilante_dias_muda ?? 8);
const FALLOS_PAUSA = Number(ajus.vigilante_fallos_para_pausar ?? 3);

// ── 1. Elementos en error ──────────────────────────────────────────────────
// Un 429 o un «high demand» no son un fallo del elemento: son esperar. Esos
// vuelven solos a la cola. Lo que no encaje en un patrón conocido se anota, con
// el mensaje agrupado — diez errores iguales son UN problema, no diez.
const TRANSITORIO = /429|503|high demand|overloaded|timeout|ETIMEDOUT|ECONNRESET|socket hang up/i;
const fallidos = await sb('glossa_radar_items?select=id,title,error&state=eq.error&limit=500');

const recuperables = (fallidos ?? []).filter(i => TRANSITORIO.test(String(i.error ?? '')));
if (recuperables.length) {
  for (const i of recuperables)
    await sb(`glossa_radar_items?id=eq.${i.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ state: 'pending', error: null }) });
  console.log(`  recuperados a la cola: ${recuperables.length} (fallo pasajero)`);
}

const duros = (fallidos ?? []).filter(i => !TRANSITORIO.test(String(i.error ?? '')));
if (duros.length) {
  const porMensaje = {};
  for (const i of duros) {
    const k = String(i.error ?? '').replace(/\s+/g, ' ').slice(0, 90);
    (porMensaje[k] ||= []).push(i.title);
  }
  const [mensaje, cuales] = Object.entries(porMensaje).sort((a, b) => b[1].length - a[1].length)[0];
  await anotar({
    clase: 'elementos_en_error',
    gravedad: duros.length >= 5 ? 'grave' : 'aviso',
    detalle: `${duros.length} elemento(s) sin poder leerse. El más repetido: ${mensaje}`,
    evidencia: { total: duros.length, por_mensaje: Object.fromEntries(
      Object.entries(porMensaje).map(([k, v]) => [k, v.length])), ejemplos: cuales.slice(0, 3) },
  });
}

// ── 2. Fuentes que dejaron de traer ────────────────────────────────────────
const fuentes = await sb('rpc/glossa_radar_fuentes_panel', { method: 'POST', body: '{}' });
for (const s of (fuentes ?? []).filter(x => x.active)) {
  const dias = s.ultimo_item_at
    ? Math.round((Date.now() - new Date(s.ultimo_item_at)) / 864e5) : null;
  if (!s.pendientes && !s.procesados_7d && (dias === null || dias >= DIAS_MUDA)) {
    await anotar({
      clase: 'fuente_muda', sujeto: s.name,
      detalle: dias === null
        ? 'sigue activa y no ha traído nada nunca'
        : `sigue activa y lleva ${dias} días sin traer nada`,
      evidencia: { dias, ultimo_chequeo: s.last_checked_at },
    });
  }
}

// ── 3. Fuentes por búsqueda que fallan seguido ─────────────────────────────
// Esta sí se arregla sola: una fuente que lleva tres corridas fallando gasta
// turno y cuota sin traer nada, y pausarla es reversible con un clic.
const rotas = await sb(
  `glossa_radar_sources?select=id,name,consecutive_failures&active=is.true&consecutive_failures=gte.${FALLOS_PAUSA}`);
for (const s of rotas ?? []) {
  await sb(`glossa_radar_sources?id=eq.${s.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false }) });
  await anotar({
    clase: 'fuente_pausada', sujeto: s.name, gravedad: 'grave',
    detalle: `${s.consecutive_failures} fallos seguidos`,
    accion: 'pausada — se reactiva desde el panel cuando esté arreglada',
    evidencia: { fallos: s.consecutive_failures },
  });
}

// ── 4. Trabajos que están fallando ─────────────────────────────────────────
// Lo que de verdad hacía falta hoy: el número falló dos domingos seguidos y no
// lo dijo nadie.
// Las tres reglas vienen del checklist de thesis (`phd-agents/docs/
// REVISION-SISTEMA.md`), que lleva tiempo corriendo y ya sabe dónde están los
// puntos ciegos. Las dos últimas yo no las tenía:
//
//   · «un paso que se come el timeout muere como CANCELLED, no como failure — y
//     las reglas que solo miran failure no lo ven». Mi primera versión miraba
//     solo `failure`, así que un número muerto por tiempo era invisible.
//   · «un workflow cuyo último run falló y lleva >48h sin volver a correr» y «un
//     workflow programado que lleva más de su cadencia sin correr». Mirar solo
//     las últimas corridas no ve al que DEJÓ de correr — y GitHub apaga los
//     horarios de un repo sin actividad.
const MAL = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure']);
const CADENCIA_H = { 'glossa-weekly.yml': 24 * 8, 'glossa-cotejo.yml': 24 * 8,
                     'glossa-monitores.yml': 30, 'glossa-consejo.yml': 24 * 8,
                     'glossa-vigilante.yml': 8 };

if (GH) {
  for (const [wf, cadencia] of Object.entries(CADENCIA_H)) {
    if (wf === 'glossa-vigilante.yml') continue;      // no se vigila a sí mismo
    try {
      const cab = { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json',
                    'User-Agent': 'glossa-vigilante' };

      // Un trabajo recién creado todavía no ha tenido su turno. Sin esto, el día
      // que se añaden tres relojes el panel abre con tres alarmas falsas — y así
      // es exactamente como un vigilante se vuelve algo que se ignora.
      const meta = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${wf}`, { headers: cab });
      if (!meta.ok) continue;
      const info = await meta.json();
      const horasDesdeQueExiste = (Date.now() - new Date(info.created_at)) / 36e5;
      if (info.state !== 'active') {
        await anotar({ clase: 'trabajo_desactivado', sujeto: wf, gravedad: 'grave',
          detalle: `GitHub lo tiene en «${info.state}» — no va a correr solo`,
          evidencia: { estado: info.state } });
        continue;
      }

      const r = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${wf}/runs?per_page=5`, { headers: cab });
      if (!r.ok) continue;
      const runs = (await r.json()).workflow_runs ?? [];
      const hechas = runs.filter(x => x.status === 'completed');

      // Dejó de correr del todo. Es el punto ciego que las otras dos reglas no ven,
      // porque no hay ninguna corrida nueva que mirar.
      const ultima = runs[0];
      const horas = ultima ? (Date.now() - new Date(ultima.created_at)) / 36e5 : Infinity;
      // Se le da una cadencia entera de margen desde que existe antes de exigirle
      // haber corrido.
      const estrenando = horasDesdeQueExiste < cadencia * 1.2;
      if (!estrenando && (!ultima || horas > cadencia * 1.5)) {
        await anotar({
          clase: 'trabajo_parado', sujeto: wf, gravedad: 'grave',
          detalle: ultima
            ? `lleva ${Math.round(horas)} h sin correr y su cadencia es de ${cadencia} h`
            : 'no ha corrido nunca',
          evidencia: { horas: Math.round(horas), cadencia },
        });
        continue;
      }

      if (!hechas.length) continue;
      const malas = hechas.filter(x => MAL.has(x.conclusion));
      if (MAL.has(hechas[0].conclusion)) {
        // Falló y no ha vuelto a intentarlo: el peor caso, porque parece quieto.
        const desdeUltimo = (Date.now() - new Date(hechas[0].created_at)) / 36e5;
        const abandonado = desdeUltimo > 48;
        await anotar({
          clase: 'trabajo_fallando', sujeto: wf,
          gravedad: (malas.length >= 2 || abandonado) ? 'grave' : 'aviso',
          detalle: `la última corrida acabó en «${hechas[0].conclusion}»` +
            (malas.length >= 2 ? ` y ${malas.length} de las ${hechas.length} últimas también` : '') +
            (abandonado ? `, y lleva ${Math.round(desdeUltimo)} h sin reintentarse` : ''),
          evidencia: { ultimas: hechas.slice(0, 3).map(x =>
            ({ cuando: x.created_at, resultado: x.conclusion, url: x.html_url })) },
        });
      }
    } catch { /* si GitHub no contesta, no es una anomalía del sistema */ }
  }
}

// ── 5. Presupuestos ────────────────────────────────────────────────────────
const gasto = await sb('rpc/glossa_radar_presupuesto', { method: 'POST', body: '{}' });
const VENTANA = { gemini: ['hoy', 'cap_gemini_dia'], youtube: ['hoy', 'cap_youtube_dia'],
                  tavily: ['mes', 'cap_tavily_mes'] };
for (const u of gasto ?? []) {
  const [ventana, clave] = VENTANA[u.proveedor] ?? [];
  const tope = clave ? Number(ajus[clave] ?? 0) : 0;
  if (tope && Number(u[ventana]) >= tope * 0.9) {
    await anotar({
      clase: 'presupuesto_al_limite', sujeto: u.proveedor,
      gravedad: Number(u[ventana]) >= tope ? 'grave' : 'aviso',
      detalle: `${u[ventana]} de ${tope} (${ventana})`,
      evidencia: { uso: u[ventana], tope, ventana },
    });
  }
}

// ── 6. El número de la semana ──────────────────────────────────────────────
// Solo se pregunta a partir del domingo por la tarde: antes, que no exista es lo
// normal.
const hoy = new Date();
if (hoy.getUTCDay() === 0 && hoy.getUTCHours() >= 14) {
  const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 7));
  const [w] = await sb(`glossa_radar_weekly?select=week_start,state&week_start=eq.${desde.toISOString().slice(0, 10)}`) ?? [];
  if (!w) await anotar({
    clase: 'numero_ausente', gravedad: 'grave',
    detalle: 'es domingo por la tarde y no hay número de esta semana',
    evidencia: { semana_esperada: desde.toISOString().slice(0, 10) },
  });
}

// ── Cerrar lo que ya no pasa ───────────────────────────────────────────────
// Una incidencia que sigue abierta es una que sigue pasando. Sin esto, el panel
// acumularía problemas resueltos y dejaría de mirarse.
const abiertas = await sb('glossa_radar_incidencias?select=id,clase,sujeto&abierta=is.true');
let cerradas = 0;
for (const i of abiertas ?? []) {
  if (vistas.has(`${i.clase}|${i.sujeto ?? ''}`)) continue;
  await sb(`glossa_radar_incidencias?id=eq.${i.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ abierta: false, cerrada_at: new Date().toISOString() }) });
  cerradas++;
}

console.log(`\n${vistas.size} incidencia(s) abierta(s) · ${cerradas} cerrada(s) por resolverse solas`);
