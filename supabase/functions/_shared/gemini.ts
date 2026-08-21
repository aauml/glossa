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

export function geminiJson(resp: any) {
  const t = (resp.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('');
  return JSON.parse(t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
}

export const geminiTokens = (resp: any) => resp?.usageMetadata?.totalTokenCount ?? 0;
