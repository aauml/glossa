#!/usr/bin/env node
// Empuja la cola de piezas sueltas. Corre cada veinte minutos.
//
// Existe porque una pieza puede quedarse esperando por causas que se resuelven
// solas —el cupo diario de Gemini, otra corrida ocupando el turno, un fallo de
// red— y nadie debería tener que darle a «retry» a mano. Si hay algo pendiente
// y el turno está libre, lanza la más antigua; si no, no hace nada y se calla.
const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const sb = async (path, init = {}) => {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};

const [lease] = await sb('glossa_radar_settings?key=eq.pieza_lease&select=value') ?? [];
const v = lease?.value;
if (v?.at && Date.now() - Date.parse(v.at) < 45 * 60_000) {
  // ¿Esa corrida sigue viva? El reloj de 45 minutos es la red de seguridad,
  // no el diagnóstico: una corrida cancelada o muerta bloqueaba la cola
  // tres cuartos de hora por nada. Se le pregunta a GitHub, que lo sabe.
  const viva = await corridaViva(v.run);
  if (viva) {
    console.log(`Hay una corrida escribiendo (${v.run}). Nada que empujar.`);
    process.exit(0);
  }
  console.log(`El turno lo tenía ${v.run}, que ya terminó. Se libera.`);
  await sb('glossa_radar_settings', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: 'pieza_lease', value: { run: null, at: null } }]) });
}

/** ¿Sigue corriendo ese run de Actions? Sin token, se confía en el reloj. */
async function corridaViva(run) {
  const tok = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!tok || !repo || !run || /^local-/.test(String(run))) return true;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run}`,
      { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) return true;
    const d = await r.json();
    return d.status !== 'completed';
  } catch { return true; }
}

const pend = await sb('glossa_radar_items?select=id,title,progress&origin=eq.pieza&state=eq.pending' +
                      '&order=created_at.asc&limit=1') ?? [];
if (!pend.length) { console.log('Cola vacía.'); process.exit(0); }

const it = pend[0];
// La barra del panel deja de enseñar el «failed» del intento anterior: esta
// pieza está esperando runner, no rota.
await sb(`glossa_radar_items?id=eq.${it.id}`, {
  method: 'PATCH', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ progress: { pct: 4, fase: 'queued — launching', 
    intentos: Number(it.progress?.intentos ?? 0), updated_at: new Date().toISOString() } }) });
await sb('rpc/glossa_pieza_dispatch', { method: 'POST', body: JSON.stringify({ item: it.id }) });
console.log(`Lanzada: «${String(it.title).slice(0, 60)}» (${it.id})`);
const quedan = await sb('glossa_radar_items?select=id&origin=eq.pieza&state=eq.pending') ?? [];
console.log(`Quedan ${Math.max(0, quedan.length - 1)} detrás.`);
