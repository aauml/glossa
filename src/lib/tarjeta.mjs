// La tarjeta que se ve cuando alguien pega un enlace de Glossa en WhatsApp,
// en X o en Slack.
//
// Antes había UNA imagen fija para las noventa páginas —y los números de la
// revista no tenían ninguna—, así que treinta enlaces distintos se veían
// idénticos y ninguno decía de qué iba. La tarjeta lleva ahora el titular y la
// fecha de lo que se comparte, que es lo que decide si el otro lo abre.
//
// Se dibuja al PUBLICAR, no al pedirla: un número se reescribe rara vez, y
// cuando se reescribe se vuelve a dibujar. Así el enlace no depende de que un
// servicio de imágenes esté vivo.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const F = (n) => readFileSync(fileURLToPath(new URL(`../../assets/og/${n}`, import.meta.url)));
// En .woff, no .woff2: el analizador de fuentes de satori no lee woff2. Y en
// estático, no variable — con el Fraunces variable revienta leyendo su tabla
// `fvar` («Cannot read properties of undefined»), que no es un error que se
// pueda interpretar sin saber esto.
const FUENTES = [
  { name: 'Fraunces', data: F('Fraunces-600.woff'), weight: 600, style: 'normal' },
  { name: 'Spectral', data: F('Spectral-400.woff'), weight: 400, style: 'normal' },
];

// Los mismos colores que el papel del sitio. Un enlace que se ve de un color en
// la tarjeta y de otro al abrirlo parece de dos sitios distintos.
const PAPEL = '#F4EDE4', TINTA = '#1A1614', OXBLOOD = '#7A2E2E', SUAVE = '#6B625B';

// Qué es Glossa, en quince palabras. La portada lo cuenta en tres párrafos;
// aquí hay sitio para una línea y tiene que bastarse sola.
const QUE_ES = {
  en: 'The sources I choose, read every week and checked against other outlets.',
  es: 'Las fuentes que elijo, leídas cada semana y contrastadas con otros medios.',
};

const el = (type, props = {}, ...children) => ({
  type,
  props: {
    ...props,
    // satori no asume `display` en los div como el navegador: exige decirlo, y
    // si falta suelta un error que no dice en cuál. Se pone aquí, una vez.
    style: type === 'div' ? { display: 'flex', ...props.style } : props.style,
    children: children.flat(),
  },
});

/**
 * @param titulo  el titular del número o del artículo
 * @param fecha   ya formateada («23–29 August 2026», «N° 43 · 25 ago 2026»)
 * @param lang    'en' | 'es' — la tarjeta habla el idioma del enlace
 */
export async function tarjeta({ titulo, fecha = '', lang = 'en' }) {
  // El titular manda: cuanto más largo, más pequeño, para que quepa siempre
  // sin recortarlo. Un titular cortado a mitad de palabra en la vista previa
  // es peor que uno pequeño.
  const n = String(titulo ?? '').length;
  const tam = n > 110 ? 46 : n > 78 ? 54 : n > 46 ? 64 : 74;

  const svg = await satori(
    el('div', {
      style: {
        width: 1200, height: 630, display: 'flex', flexDirection: 'column',
        backgroundColor: PAPEL, padding: '56px 72px 48px',
        borderTop: `14px solid ${OXBLOOD}`, fontFamily: 'Spectral',
      },
    },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        el('div', { style: { fontFamily: 'Fraunces', fontSize: 40, color: TINTA, display: 'flex' } },
          el('span', {}, 'Glossa'),
          el('span', { style: { color: OXBLOOD } }, '.')),
        el('div', { style: { fontSize: 22, color: SUAVE, letterSpacing: '0.06em' } }, fecha)),

      el('div', {
        style: {
          flexGrow: 1, display: 'flex', alignItems: 'center',
          fontFamily: 'Fraunces', fontSize: tam, lineHeight: 1.14,
          color: TINTA, letterSpacing: '-0.015em', marginTop: 28,
        },
      }, String(titulo ?? '')),

      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        el('div', { style: { width: 120, height: 1, backgroundColor: '#CBBFB2', display: 'flex' } }),
        el('div', { style: { fontSize: 24, color: SUAVE, lineHeight: 1.35 } }, QUE_ES[lang] ?? QUE_ES.en),
        el('div', { style: { fontSize: 20, color: OXBLOOD, letterSpacing: '0.04em' } }, 'glossa.ademas.ai')),
    ),
    { width: 1200, height: 630, fonts: FUENTES },
  );

  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
