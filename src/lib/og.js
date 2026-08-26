// Dónde vive la tarjeta de compartir de cada página.
//
// Se dibujan al publicar (scripts/tarjetas.mjs) y se guardan fuera del repo:
// son 96 imágenes y crecen una por pieza. Si falta la variable de entorno o la
// tarjeta no llegó a dibujarse, queda la fija de siempre — un enlace sin
// imagen se ve peor que uno con la imagen genérica.
const BASE = (import.meta.env?.SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');

/**
 * La versión del DISEÑO de la tarjeta. Se sube a mano cuando la tarjeta cambia
 * de aspecto, y con ella cambia la URL.
 *
 * Hace falta porque WhatsApp, X y los demás guardan la vista previa por URL y
 * NO vuelven a mirarla: se rediseñó la tarjeta, la imagen nueva quedó guardada
 * en el mismo sitio, y al compartir seguía saliendo la vieja. El fichero es el
 * mismo; lo que cambia es la dirección con la que se pide, que es lo único que
 * esos servicios miran.
 *
 * Un enlace compartido ANTES de subir esto conserva su vista previa vieja en
 * esa conversación: eso ya está en el servidor del otro y no hay forma de
 * tocarlo desde aquí.
 */
export const V = 2;

export const FIJA = 'https://glossa.ademas.ai/og.png';

/**
 * Un sello del CONTENIDO, no solo del diseño.
 *
 * Subir `V` sirve cuando cambia la tarjeta de todos; no sirve cuando cambia UNA
 * —se corrigió el titular español de una pieza, la imagen se redibujó y los
 * servicios siguieron enseñando la vieja, porque la dirección era la misma—.
 * Con el titular dentro del sello, corregir el titular estrena URL sin que
 * nadie tenga que acordarse de nada.
 */
const sello = (txt) => {
  let h = 0;
  for (const c of String(txt ?? '')) h = (Math.imul(h, 31) + c.codePointAt(0)) | 0;
  return (h >>> 0).toString(36);
};

export const tarjetaArticulo = (slug, lang, titulo = '') =>
  BASE ? `${BASE}/storage/v1/object/public/og/articles/${slug}-${lang}.png?v=${V}${titulo ? '-' + sello(titulo) : ''}` : FIJA;

export const tarjetaSemanal = (week, lang, titulo = '') =>
  BASE ? `${BASE}/storage/v1/object/public/og/weekly/${week}-${lang}.png?v=${V}${titulo ? '-' + sello(titulo) : ''}` : FIJA;
