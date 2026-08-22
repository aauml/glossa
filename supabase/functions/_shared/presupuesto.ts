// Topes de gasto, lado Deno. El gemelo en Node vive en `src/lib/presupuesto.js`
// y hace lo mismo; son dos runtimes que no pueden compartir módulo. Se dejan
// cortos a propósito, para que una divergencia se vea en un diff.
//
// Un tope alcanzado NO es un error. Es un resultado normal: se salta el trabajo,
// se registra y se sigue. Nunca deja elementos en `state='error'`, porque el
// elemento no tiene la culpa y mañana entrará sin problema.

export type Uso = { proveedor: string; hoy: number; semana: number; mes: number; coste_mes: number };

export async function ajustes(db: any): Promise<Record<string, unknown>> {
  const { data } = await db.from('glossa_radar_settings').select('key,value');
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

export async function uso(db: any): Promise<Record<string, Uso>> {
  const { data } = await db.rpc('glossa_radar_presupuesto');
  return Object.fromEntries((data ?? []).map((r: Uso) => [r.proveedor, r]));
}

/** Suma y sigue. No se espera: perder una cuenta es peor que ir un poco lento. */
export async function apuntar(db: any, proveedor: string, llamadas = 1, tokens = 0, coste = 0) {
  const { error } = await db.rpc('glossa_radar_uso_sumar', {
    p_proveedor: proveedor, p_llamadas: llamadas, p_tokens: tokens, p_coste: coste,
  });
  if (error) console.error(`no se pudo apuntar el uso de ${proveedor}: ${error.message}`);
}

/**
 * `true` si queda margen. El que llama decide si eso significa saltarse una
 * pasada o cortar un bucle; aquí solo se responde a la pregunta.
 */
export function cabe(u: Record<string, Uso>, ajus: Record<string, unknown>,
                     proveedor: string, clave: string, ventana: 'hoy' | 'semana' | 'mes' = 'hoy') {
  const tope = Number(ajus[clave] ?? 0);
  if (!tope) return true;                       // sin tope configurado, no se estorba
  return Number(u[proveedor]?.[ventana] ?? 0) < tope;
}
