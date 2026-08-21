/**
 * Llamadas a Gemini (API, tramo gratuito). No usa la suscripción Pro: son
 * facturaciones distintas y la suscripción no da cuota de API.
 */

function gemini_(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let ultimo;
  for (let intento = 0; intento < CFG.RETRIES; intento++) {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': prop_('GEMINI_API_KEY') },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code === 200) return JSON.parse(text);

    ultimo = `${code}: ${text.slice(0, 200)}`;
    // 429 (cuota) y 503 (capacidad) son transitorios: el tramo gratuito devuelve
    // "high demand" a menudo. Un 400 es culpa nuestra y no mejora reintentando.
    const transitorio = code === 429 || code === 503 || /high demand|overloaded/i.test(text);
    if (!transitorio) break;
    Utilities.sleep(CFG.RETRY_BASE_MS * Math.pow(2, intento));
  }
  throw new Error(`Gemini ${ultimo}`);
}

/** Extrae el JSON de la respuesta, tolerando que venga envuelto en ```json. */
function geminiJson_(resp) {
  const t = resp.candidates[0].content.parts.map(p => p.text || '').join('');
  const limpio = t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  return JSON.parse(limpio);
}

const geminiTokens_ = resp => (resp.usageMetadata || {}).totalTokenCount || 0;

/** Parte multimedia: vídeo de YouTube con muestreo bajo, o audio de podcast. */
function mediaPart_(item, kind) {
  const part = { fileData: { fileUri: item.url } };
  if (kind === 'youtube') part.videoMetadata = { fps: CFG.VIDEO_FPS };
  return part;
}
