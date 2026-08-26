// Dónde vive la tarjeta de compartir de cada página.
//
// Se dibujan al publicar (scripts/tarjetas.mjs) y se guardan fuera del repo:
// son 96 imágenes y crecen una por pieza. Si falta la variable de entorno o la
// tarjeta no llegó a dibujarse, queda la fija de siempre — un enlace sin
// imagen se ve peor que uno con la imagen genérica.
const BASE = (import.meta.env?.SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');

export const FIJA = 'https://glossa.ademas.ai/og.png';

export const tarjetaArticulo = (slug, lang) =>
  BASE ? `${BASE}/storage/v1/object/public/og/articles/${slug}-${lang}.png` : FIJA;

export const tarjetaSemanal = (week, lang) =>
  BASE ? `${BASE}/storage/v1/object/public/og/weekly/${week}-${lang}.png` : FIJA;
