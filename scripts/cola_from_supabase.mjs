// cola_from_supabase.mjs — leer lo que espera, ahora, en vez de en siete horas.
//
// El radar corre cada 15 minutos y cada pasada lee unos dos episodios: le caben
// 120 s de los 150 que tiene una edge function, y reserva 50 s por episodio
// para no dejar ninguno a medias. Eso son ~12 por hora, que está bien para el
// día a día y no sirve cuando quieres cortar el número ahora y tienes ochenta
// esperando.
//
// Esto llama a la MISMA función, una detrás de otra sin esperar los 15 minutos.
// Mismo código, mismo presupuesto, mismos límites: lo único que cambia es la
// frecuencia. Sale ~60 por hora en vez de ~12.
//
// SECUENCIAL a propósito. Dos llamadas a la vez cogerían los mismos elementos:
// el radar selecciona ocho pendientes y los marca `running` uno a uno según los
// procesa, así que entre el select de una y el marcado de la otra hay hueco
// para pagar dos veces el mismo episodio.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GLOSSA_PUBLISH_TOKEN.

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY    = process.env.SUPABASE_SERVICE_KEY || '';
const TOKEN  = process.env.GLOSSA_PUBLISH_TOKEN || '';
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!TOKEN)          { console.error('Falta GLOSSA_PUBLISH_TOKEN'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const MINUTOS = Number(process.env.COLA_MINUTOS || 100);
const PAUSA_MS = Number(process.env.COLA_PAUSA_S || 45) * 1000;
const t0 = Date.now();
const queda = () => MINUTOS * 60_000 - (Date.now() - t0);

async function estado() {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/glossa_radar_estado`, { method: 'POST', headers: H, body: '{}' });
  if (!r.ok) throw new Error(`estado ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function pasada() {
  const r = await fetch(`${URL_SB}/functions/v1/glossa-radar-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-glossa-token': TOKEN },
    // Solo digerir: descubrir tiene su propio reloj cada 6 h y volver a pedir
    // los feeds en cada vuelta gastaría cuota de YouTube para nada.
    body: JSON.stringify({ skip_discover: true }),
    signal: AbortSignal.timeout(170_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`radar ${r.status}: ${txt.slice(0, 200)}`);
  try { return JSON.parse(txt); } catch { return {}; }
}

let e = await estado();
console.log(`${e.por_leer} por leer de la semana ${String(e.desde).slice(0, 10)} → ${String(e.hasta).slice(0, 10)}` +
            ` · ${e.listos} ya listos`);
if (!e.por_leer) { console.log('Nada que leer.'); process.exit(0); }

let vueltas = 0, quietas = 0;
const arranque = e.por_leer;

while (e.por_leer > 0 && queda() > 180_000) {
  vueltas++;
  let log;
  try { log = await pasada(); }
  catch (err) { console.log(`  ✗ vuelta ${vueltas}: ${String(err).slice(0, 120)}`); quietas++; if (quietas >= 3) break; continue; }

  // Un tope alcanzado no es un error, pero seguir llamando sí sería tirar el
  // tiempo: la función va a devolver lo mismo hasta que cambie el día.
  if (log.presupuesto_agotado?.includes('gemini')) {
    console.log('\nTope diario de Gemini alcanzado. Lo que queda se leerá mañana.');
    break;
  }

  const antes = e.por_leer;
  e = await estado();
  const hechos = antes - e.por_leer;
  console.log(`  vuelta ${String(vueltas).padStart(2)} · ${hechos > 0 ? `-${hechos}` : ' 0'} · ` +
              `quedan ${e.por_leer} · ${Math.round(queda() / 60_000)} min de margen`);

  // Tres vueltas sin mover nada y no es la cola lo que falla. Insistir treinta
  // veces más solo esconde que algo está roto.
  quietas = hechos > 0 ? 0 : quietas + 1;
  if (quietas >= 3) { console.log('\nTres vueltas sin avanzar; se para.'); break; }

  // Pausa. El techo de verdad no es el tiempo de la edge function, es la cuota
  // del tramo gratuito de Gemini: llamando sin respirar, una pasada devolvió un
  // episodio leído y DOS «429 exceeded your current quota» en 93 s. El radar
  // los devuelve a la cola, así que no se pierde nada — pero forzar el ritmo
  // para que dos de cada tres reboten no es ir más rápido.
  //
  // Si la vuelta anterior tocó cuota, se espera más. Es la señal más directa que
  // hay de que se está apretando de más.
  const espera = hechos > 0 ? PAUSA_MS : PAUSA_MS * 3;
  if (e.por_leer > 0 && queda() > espera + 120_000) {
    await new Promise(r => setTimeout(r, espera));
  }
}

console.log(`\n${arranque - e.por_leer} leídos en ${vueltas} vuelta(s) · quedan ${e.por_leer}` +
            ` · ${e.listos} listos para el número`);
if (e.por_leer > 0) process.exitCode = 0;   // quedarse a medias no es un fallo
