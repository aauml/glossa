// Llamadas a Gemini (API, tramo gratuito). No usa la suscripción Pro: son
// facturaciones distintas y la suscripción no da cuota de API.

// La etapa 1 es trabajo mecánico y va en el modelo con más cuota diaria (500/día
// frente a 20). Los modelos Pro están a 0 en el tramo gratuito y no son opción.
export const MODELO_DIGEST = 'gemini-3.1-flash-lite';

// Un fotograma cada 10 s. Medido sobre un episodio de una hora: 332.772 tokens
// al muestreo por defecto contra un tope de 250.000/min, y 126.375 así. Por
// debajo ya no baja: lo que queda es el audio, que es irreducible.
export const VIDEO_FPS = 0.1;

export async function gemini(modelo: string, body: unknown, intentos = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  let ultimo = '';
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (r.ok) return JSON.parse(txt);
    ultimo = `${r.status}: ${txt.slice(0, 160)}`;
    // 429 y 503 son transitorios: el tramo gratuito devuelve "high demand" a
    // menudo, y no es culpa del episodio. Un 400 sí es nuestro y no mejora.
    if (!(r.status === 429 || r.status === 503 || /high demand|overloaded/i.test(txt))) break;
    await new Promise(res => setTimeout(res, 3000 * Math.pow(2, i)));
  }
  throw new Error(`Gemini ${ultimo}`);
}

/**
 * El JSON de una respuesta, aunque venga acompañado.
 *
 * Antes esto sólo quitaba las vallas del bloque de código y llamaba a
 * `JSON.parse` sobre todo lo demás. Basta con que el modelo añada una frase
 * DETRÁS del objeto —o un segundo bloque— para que reviente con «Unexpected
 * non-whitespace character after JSON at position 698», y el episodio se queda
 * en `error` por algo que estaba entero delante de las narices. Tres de los
 * cuatro elementos atascados el 2026-08-28 eran exactamente eso.
 *
 * Así que si el texto entero no parsea, se recorta el primer valor JSON
 * BALANCEADO y se parsea ese. Se cuenta la profundidad respetando las cadenas y
 * los escapes, porque una llave dentro de una cita —«dijo "{" y se fue»— cerraría
 * el objeto antes de tiempo si se contara a lo bruto.
 *
 * Lo que NO arregla, a propósito: un objeto mal formado POR DENTRO (una clave sin
 * comillas). Eso no es recortable y sale como error, que es la verdad; el
 * vigilante lo archiva a las 48 h. Reintentarlo sería tirar el dado otra vez a
 * costa de una cuota diaria que ya va justa.
 */
export function geminiJson(resp: any) {
  const t = (resp.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('');
  const limpio = t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(limpio);
  } catch (e) {
    const abre = limpio.search(/[[{]/);
    if (abre < 0) throw e;
    const cierra = { '{': '}', '[': ']' }[limpio[abre] as '{' | '['];
    let hondo = 0, enCadena = false, escapado = false;
    for (let i = abre; i < limpio.length; i++) {
      const c = limpio[i];
      if (escapado) { escapado = false; continue; }
      if (c === '\\' && enCadena) { escapado = true; continue; }
      if (c === '"') { enCadena = !enCadena; continue; }
      if (enCadena) continue;
      if (c === limpio[abre]) hondo++;
      else if (c === cierra && --hondo === 0) return JSON.parse(limpio.slice(abre, i + 1));
    }
    throw e;
  }
}

export const geminiTokens = (resp: any) => resp?.usageMetadata?.totalTokenCount ?? 0;
