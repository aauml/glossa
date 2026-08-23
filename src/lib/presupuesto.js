// Topes de gasto, lado Node (los guiones de los Actions). El gemelo en Deno vive
// en `supabase/functions/_shared/presupuesto.ts`. Dos runtimes, dos copias; se
// dejan cortas para que una divergencia se vea en un diff.
//
// Un tope alcanzado no es un error: se salta el trabajo, se registra y se sigue.

const cab = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

async function rpc(url, key, fn, args = {}) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: cab(key), body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

export async function ajustes(url, key) {
  const r = await fetch(`${url}/rest/v1/glossa_radar_settings?select=key,value`, { headers: cab(key) });
  if (!r.ok) return {};
  return Object.fromEntries((await r.json()).map(x => [x.key, x.value]));
}

export async function uso(url, key) {
  const filas = await rpc(url, key, 'glossa_radar_presupuesto');
  return Object.fromEntries((filas ?? []).map(f => [f.proveedor, f]));
}

export async function apuntar(url, key, proveedor, llamadas = 1, tokens = 0, coste = 0) {
  try {
    await rpc(url, key, 'glossa_radar_uso_sumar', {
      p_proveedor: proveedor, p_llamadas: llamadas, p_tokens: tokens, p_coste: coste,
    });
  } catch (e) {
    console.error(`  no se pudo apuntar el uso de ${proveedor}: ${String(e).slice(0, 120)}`);
  }
}

/**
 * Suma el gasto TAMBIÉN en la copia local del contador.
 *
 * `uso()` se lee una vez al arrancar y no se vuelve a leer, mientras `apuntar()`
 * escribe en la base. Sin esto, una corrida que hace veinte búsquedas pasa
 * `cabe()` veinte veces aunque reventara el tope en la tercera: el contador que
 * mira es una foto del principio.
 *
 * El radar ya lo hacía a mano en línea (`glossa-radar-run/index.ts`); vive aquí
 * para que sea una implementación y no dos.
 */
export function apuntarLocal(u, proveedor, llamadas = 1, ventanas = ['hoy', 'semana', 'mes']) {
  const p = (u[proveedor] ||= { hoy: 0, semana: 0, mes: 0 });
  for (const v of ventanas) p[v] = Number(p[v] ?? 0) + llamadas;
  return u;
}

/** `true` si queda margen bajo ese tope. Sin tope configurado, no se estorba. */
export function cabe(u, ajus, proveedor, clave, ventana = 'hoy') {
  const tope = Number(ajus[clave] ?? 0);
  if (!tope) return true;
  return Number(u[proveedor]?.[ventana] ?? 0) < tope;
}

/** Lo mismo pero en dólares, que es como se mide el único proveedor de pago. */
export function cabeCoste(u, ajus, proveedor, clave) {
  const tope = Number(ajus[clave] ?? 0);
  if (!tope) return true;
  return Number(u[proveedor]?.coste_mes ?? 0) < tope;
}

// ── El cupo mensual de Tavily se administra solo ──────────────────────────
//
// Por qué existe este archivo: las fuentes van a seguir creciendo. Cada fuente
// nueva trae más asuntos, y más asuntos sobre el mismo cupo mensual significa
// menos por asunto — a menos que alguien lo reparta. Un tope fijo escrito a mano
// («24 búsquedas por semana») no es un reparto: es una cifra que envejece en
// cuanto se añade la fuente número treinta y cuatro.
//
// Tres cosas, en este orden:
//
//  1. **La verdad la dice Tavily, no mi cuaderno.** El 2026-08-23 mi contador
//     decía 74 y Tavily 117. La diferencia son llamadas que no pasaron por
//     `apuntar` (pruebas, sobre todo). Un presupuesto que se mide contra su
//     propio apunte se pasa del real sin enterarse, así que se pregunta.
//  2. **Lo que queda se reparte entre las semanas que faltan**, descontando lo
//     que cotejo y monitores gastan de media — que también salen del mismo cupo
//     y no avisan.
//  3. **La anchura no entra en este reparto.** Google News no cobra: todo asunto
//     se barre siempre. Lo que se reparte es la profundidad, y va a donde el
//     barrido dijo que hay algo que discutir.

/** Lo que Tavily dice de sí mismo. Es la única cifra que no deriva. */
export async function estadoTavily(clave, fetchImpl = fetch) {
  try {
    const r = await fetchImpl('https://api.tavily.com/usage', {
      headers: { Authorization: `Bearer ${clave}` },
    });
    if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}` };
    const d = await r.json();
    const usados = Number(d?.account?.plan_usage ?? d?.key?.usage ?? 0);
    const tope   = Number(d?.account?.plan_limit ?? 0) || null;
    return {
      ok: true, usados, tope, plan: d?.account?.current_plan ?? null,
      restantes: tope ? Math.max(0, tope - usados) : null,
    };
  } catch (e) { return { ok: false, motivo: String(e).slice(0, 90) }; }
}

/** Días hasta que el cupo se renueva. Sin un dato duro del proveedor se asume
 *  mes natural; `diaReset` lo corrige si algún día se observa otra cosa. */
export function diasHastaReset(ahora, diaReset = 1) {
  const d = new Date(ahora);
  const prox = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diaReset));
  if (prox <= d) prox.setUTCMonth(prox.getUTCMonth() + 1);
  return Math.max(1, Math.ceil((prox - d) / 86_400_000));
}

/**
 * El reparto de la semana.
 *
 * `otrosPorSemana` es lo que cotejo y monitores se llevan; se mide de la
 * historia real, no se supone. `reserva` es el colchón que queda sin repartir
 * para que una semana con mucha tela no deje a las siguientes sin nada.
 */
export function reparto({ restantes, dias, otrosPorSemana = 0, reserva = 0.15, minimo = 8, maximo = 120 }) {
  if (restantes == null) return { semana: maximo, nota: 'sin tope conocido' };
  const semanas = Math.max(1, Math.ceil(dias / 7));
  const paraOtros = Math.min(restantes, otrosPorSemana * semanas);
  const libre = Math.max(0, restantes - paraOtros) * (1 - reserva);
  const semana = Math.max(minimo, Math.min(maximo, Math.floor(libre / semanas)));
  return {
    semana, semanas, paraOtros: Math.round(paraOtros),
    nota: `${restantes} restantes · ${semanas} semana(s) · ${Math.round(paraOtros)} reservadas a cotejo/monitores`,
  };
}

/**
 * Cómo se parte la asignación de la semana entre los asuntos.
 *
 * Entra la lista de temas ya leída por el barrido —cada uno con su urgencia de 0
 * a 3— y sale cuántas búsquedas de pago le tocan a cada uno. Un tema de urgencia
 * 0 (cuarenta medios de cinco países titulando lo mismo) se lleva CERO: ya está
 * corroborado, y pagar por confirmarlo otra vez no compra nada. Ese cero es lo
 * que financia los temas de urgencia 3, que son los que nadie más ha contado o
 * en los que los titulares se separan.
 */
export function repartirEntreTemas(temas, presupuesto, { porTemaMax = 6 } = {}) {
  // Ningún asunto se lleva más de un cuarto de la semana, por urgente que
  // parezca. «Nadie fuera escribió de esto» es la puntuación máxima y puede
  // significar dos cosas muy distintas: una exclusiva, o que un canal se inventó
  // un asunto que no existe. Sin este freno, un tema con la segunda pinta se
  // llevaba la mitad del presupuesto — y si el censo se cae para varios a la vez,
  // todos puntúan alto y entre unos pocos se lo comen todo.
  const tope = Math.max(1, Math.min(porTemaMax, Math.ceil(presupuesto / 4)));
  const pesos = temas.map(t => ({ ...t, peso: Math.max(0, t.urgencia?.nivel ?? 1) }));
  const total = pesos.reduce((s, t) => s + t.peso, 0);
  if (!total) return pesos.map(t => ({ ...t, cuota: 0 }));

  let dado = 0;
  const con = pesos
    .sort((a, b) => b.peso - a.peso)
    .map(t => {
      const cuota = Math.min(tope, Math.floor((t.peso / total) * presupuesto));
      dado += cuota;
      return { ...t, cuota };
    });

  // Lo que sobró del redondeo baja por la lista, de más urgente a menos.
  let sobra = presupuesto - dado;
  for (const t of con) {
    if (sobra <= 0) break;
    if (t.peso === 0) continue;              // el cero es deliberado, no un resto
    const cabe = Math.min(sobra, porTemaMax - t.cuota);
    t.cuota += cabe; sobra -= cabe;
  }
  return con;
}

/**
 * Lo que cotejo y monitores se llevan por semana, medido — no supuesto.
 *
 * Se deriva restando: `glossa_radar_uso` no distingue por tarea (su clave es
 * proveedor+día y la comparten cuatro guiones), pero el reportaje sí apunta sus
 * búsquedas tema a tema. Total menos reportaje es lo demás. Se prefiere derivarlo
 * a añadir una columna que obligaría a tocar el RPC que usan los cuatro.
 */
export async function otrosGastos(sb) {
  const desde = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const [uso, reps] = await Promise.all([
    sb(`glossa_radar_uso?select=dia,llamadas&proveedor=eq.tavily&dia=gte.${desde}`).catch(() => []),
    sb(`glossa_radar_reportajes?select=week_start,busquedas&week_start=gte.${desde}`).catch(() => []),
  ]);
  const total = (uso ?? []).reduce((s, f) => s + Number(f.llamadas || 0), 0);
  // Cada búsqueda del reportaje son dos créditos (Tavily «advanced»).
  const delReportaje = (reps ?? []).reduce((s, f) => s + Number(f.busquedas || 0) * 2, 0);
  const otros = Math.max(0, total - delReportaje);

  // Entre los días TRANSCURRIDOS, no entre los que tuvieron actividad. Dividir
  // por los días con fila daba 203 búsquedas semanales para cotejo y monitores
  // cuando el gasto del mes entero eran 117 créditos: con tres días apuntados,
  // 74/3×7 sale 172 y parece un dato. Y ese número no adorna nada — es lo que se
  // aparta antes de repartir, así que inflarlo deja al reportaje sin la mitad.
  // Es la misma piedra del «ritmo» del panel, que promediaba solo las horas con
  // trabajo y decía 55/h después de vaciar la cola.
  const fechas = (uso ?? []).map(f => new Date(f.dia)).filter(d => !isNaN(d));
  if (!fechas.length) return 0;
  const desdeReal = new Date(Math.min(...fechas));
  const dias = Math.max(1, Math.min(28, Math.ceil((Date.now() - desdeReal) / 86_400_000)));
  return Math.round((otros / dias) * 7);
}
