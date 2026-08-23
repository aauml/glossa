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
