// boletin_from_supabase.mjs — la entrega semanal por correo.
//
// Un correo, los domingos, con lo de esos siete días: el número de la semana y
// las piezas publicadas en ella. Sin anuncios, sin píxel de apertura, sin
// «también te puede interesar».
//
// Es un AVISO de qué salió, no una copia de lo que salió: cada cosa con su
// título, sus temas y su enlace, y nada más. Lo que hay que leer está en el
// sitio, que es donde se lee bien.
//
// Corre DESPUÉS del número y de su traducción: sin número publicado no hay
// entrega, y mandarla antes de traducir dejaría a los suscriptores en español
// con un enlace a una página que aún no existe.
//
// Las piezas se leen del propio repo (la colección de contenido), no de la
// base: son ficheros, y el checkout que ejecuta esto ya los tiene delante.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GLOSSA_RESEND_KEY.
//      BOLETIN_DRY=1 arma y enseña, pero no manda ni marca nada.

import { readFile, readdir } from 'node:fs/promises';
import { rango } from '../src/lib/weekly.js';

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY    = process.env.SUPABASE_SERVICE_KEY || '';
const RESEND = process.env.GLOSSA_RESEND_KEY || '';
const SECO   = process.env.BOLETIN_DRY === '1';
const SITIO  = 'https://glossa.ademas.ai';

if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!RESEND && !SECO) { console.error('Falta GLOSSA_RESEND_KEY'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 240)}`);
  return t ? JSON.parse(t) : null;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── ¿Hay algo que mandar? ────────────────────────────────────────────────
const ajustes = Object.fromEntries(
  ((await sb('glossa_radar_settings?select=key,value')) ?? []).map(r => [r.key, r.value]));
if (ajustes.boletin_activo === false) { console.log('El boletín está apagado (boletin_activo=false).'); process.exit(0); }

// La semana que acaba de cerrarse: la misma definición que usa todo el sistema.
const [ventana] = await sb('rpc/glossa_semana_actual', { method: 'POST', body: '{}' });
// El DOMINGO —el único día en que este guion corre solo— `glossa_semana_actual`
// ya devuelve la semana que acaba de cerrarse (parcial=false), que es la del
// número recién escrito: esa ES la semana del boletín. Cualquier otro día
// devuelve la semana en curso (parcial=true) y entonces sí toca la anterior.
// La versión previa restaba un día MÁS también el domingo, así que apuntaba a
// la semana anterior a la del número: o mandaba el número viejo, o salía en
// verde diciendo «no hay número publicado» con el número nuevo esperando.
const semana = ventana.parcial
  ? (await sb('rpc/glossa_semana_actual', {
      method: 'POST',
      body: JSON.stringify({ ref: new Date(new Date(ventana.desde).getTime() - 864e5).toISOString() }),
    }))[0]
  : ventana;
const DESDE = new Date(semana.desde), HASTA = new Date(semana.hasta);
const SEM = semana.desde.slice(0, 10);

const [numero] = await sb(
  `glossa_radar_weekly?select=week_start,week_end,state,body,body_es&week_start=eq.${SEM}`) ?? [];
if (!numero || numero.state !== 'publicado') {
  console.log(`No hay número publicado para la semana del ${SEM}. No se manda nada.`);
  process.exit(0);
}

// ── Las piezas de esa semana, leídas del repo ────────────────────────────
const piezas = [];
for (const slug of await readdir('src/content/articles')) {
  let en;
  try { en = await readFile(`src/content/articles/${slug}/en.mdx`, 'utf8'); } catch { continue; }
  const cab = en.slice(0, 2500);
  const sort = cab.match(/^sortDate:\s*"([^"]+)"/m)?.[1];
  if (!sort) continue;
  const cuando = new Date(`${sort}Z`);
  if (!(cuando >= DESDE && cuando < HASTA)) continue;
  const leer = (t, campo) => t.match(new RegExp(`^${campo}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm'))?.[1]
    ?.replace(/\\"/g, '"') ?? null;
  const temas = [...cab.matchAll(/^ {2}- "([^"]+)"/gm)].map(m => m[1]).slice(0, 4);
  let es = null;
  try { es = (await readFile(`src/content/articles/${slug}/es.mdx`, 'utf8')).slice(0, 2500); } catch { /* sin ES */ }
  piezas.push({
    slug,
    en: { titulo: leer(cab, 'title'), dek: leer(cab, 'coverDek'), issue: leer(cab, 'issue'), temas },
    es: es ? { titulo: leer(es, 'title'), dek: leer(es, 'coverDek'), issue: leer(es, 'issue'),
               temas: [...es.matchAll(/^ {2}- "([^"]+)"/gm)].map(m => m[1]).slice(0, 4) } : null,
    orden: sort,
  });
}
piezas.sort((a, b) => b.orden.localeCompare(a.orden));
console.log(`Semana ${SEM}: número «${numero.body?.headline ?? '—'}» + ${piezas.length} pieza(s).`);

// ── Los destinatarios ────────────────────────────────────────────────────
const gente = await sb('glossa_subscribers?select=id,email,lang,token&state=eq.confirmado');
if (!gente?.length) { console.log('Nadie confirmado todavía. No se manda nada.'); process.exit(0); }
console.log(`${gente.length} destinatario(s).`);

// ── El correo ────────────────────────────────────────────────────────────
//
// HTML de tabla y estilos en línea, que es lo que entienden los clientes de
// correo; nada de hojas externas ni de `flex`. Un solo color de acento, el
// mismo del sitio, y ninguna imagen: una imagen sería un píxel de seguimiento
// aunque no lo pretendiera.
const COPY = {
  en: { issue: 'The Weekly', piezas: 'Pieces this week', leer: 'Read it',
        baja: 'Unsubscribe', pie: 'You get this because you asked for it. One email a week, no ads.' },
  es: { issue: 'El semanal', piezas: 'Piezas de la semana', leer: 'Leer',
        baja: 'Darse de baja', pie: 'Recibes esto porque lo pediste. Un correo por semana, sin anuncios.' },
};

function armar(lang, token) {
  const t = COPY[lang];
  const cuerpo = lang === 'es' ? (numero.body_es || numero.body) : numero.body;
  const fechas = rango(numero.week_start, numero.week_end, lang);
  const urlNum = `${SITIO}${lang === 'es' ? '/es' : ''}/weekly/${numero.week_start}/`;
  const temasNum = (cuerpo?.pieces ?? []).map(p => p?.subject).filter(Boolean).slice(0, 6);

  const bloquePiezas = piezas.map(p => {
    const d = (lang === 'es' && p.es) ? p.es : p.en;
    const url = `${SITIO}/articles/${p.slug}/${(lang === 'es' && p.es) ? 'es' : 'en'}/`;
    return `<tr><td style="padding:0 0 26px">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.12em;color:#7A1F1F;padding-bottom:5px">${esc(d.issue ?? '')}</div>
      <a href="${url}" style="font-family:Georgia,serif;font-size:19px;line-height:1.25;color:#1A1A1A;text-decoration:none">${esc(d.titulo)}</a>
      ${d.temas?.length ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#6E6E6E;padding-top:8px">${d.temas.map(esc).join(' &middot; ')}</div>` : ''}
      <div style="padding-top:8px"><a href="${url}" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.06em;color:#7A1F1F">${esc(t.leer)}</a></div>
    </td></tr>`;
  }).join('');

  const html = `<div style="background:#F5EFE6;padding:34px 18px;margin:0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:34rem;margin:0 auto">
  <tr><td style="font-family:Georgia,serif;font-size:22px;letter-spacing:-0.01em;color:#1A1A1A;padding-bottom:4px">Glossa<span style="color:#7A1F1F">.</span></td></tr>
  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#6E6E6E;padding-bottom:26px">${esc(fechas)}</td></tr>

  <tr><td style="border-top:2px solid #1A1A1A;padding-top:16px">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#7A1F1F;padding-bottom:8px">${esc(t.issue)}</div>
    <a href="${urlNum}" style="font-family:Georgia,serif;font-size:23px;line-height:1.2;color:#1A1A1A;text-decoration:none">${esc(cuerpo?.headline ?? t.issue)}</a>
    ${temasNum.length ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#6E6E6E;padding-top:8px">${temasNum.map(esc).join(' &middot; ')}</div>` : ''}
    <div style="padding-top:12px"><a href="${urlNum}" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.06em;color:#7A1F1F">${esc(t.leer)}</a></div>
  </td></tr>

  ${piezas.length ? `<tr><td style="padding:30px 0 12px;border-top:0.5px solid #C8C2B5">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#6E6E6E">${esc(t.piezas)}</div>
  </td></tr>${bloquePiezas}` : ''}

  <tr><td style="border-top:0.5px solid #C8C2B5;padding-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#8A8A8A">
    ${esc(t.pie)}<br>
    <a href="${URL_SB}/functions/v1/glossa-boletin?baja=${token}" style="color:#8A8A8A">${esc(t.baja)}</a>
  </td></tr>
</table></div>`;

  return { asunto: `${cuerpo?.headline ?? 'Glossa'} · ${fechas}`, html };
}

// ── Mandar ───────────────────────────────────────────────────────────────
if (SECO) {
  const m = armar('en', '00000000-0000-0000-0000-000000000000');
  console.log(`\nBOLETIN_DRY — no se manda nada.\nAsunto: ${m.asunto}\n${m.html.length} bytes de HTML`);
  process.exit(0);
}

const DE = String(ajustes.boletin_remitente ?? 'Glossa <glossa@ademas.ai>');
// La API de lotes acepta 100 por llamada, y cada correo lleva SU enlace de
// baja: no se puede mandar uno solo con copia oculta.
const lotes = [];
for (let i = 0; i < gente.length; i += 100) lotes.push(gente.slice(i, i + 100));

let enviados = 0;
for (const lote of lotes) {
  const cuerpo = lote.map(p => {
    const m = armar(p.lang === 'es' ? 'es' : 'en', p.token);
    return { from: DE, to: [p.email], subject: m.asunto, html: m.html };
  });
  const r = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND}` },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) { console.error(`resend ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  enviados += lote.length;
  // `last_sent_at` se marca por lote y solo tras el 200: si el siguiente falla,
  // se ve exactamente hasta dónde llegó la entrega.
  await sb(`glossa_subscribers?id=in.(${lote.map(p => p.id).join(',')})`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
  });
}

console.log(`Boletín de la semana ${SEM} enviado a ${enviados} destinatario(s).`);
