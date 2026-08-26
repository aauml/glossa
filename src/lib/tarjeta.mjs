// La tarjeta que se ve cuando alguien pega un enlace de Glossa en WhatsApp,
// en X o en Slack.
//
// Antes había UNA imagen fija para las noventa páginas —y los números de la
// revista no tenían ninguna—, así que treinta enlaces distintos se veían
// idénticos y ninguno decía de qué iba. La tarjeta lleva ahora lo que decide
// si el otro lo abre: el titular, y debajo lo que hay dentro.
//
// Dos formas, y la franja de arriba las distingue de un vistazo:
//   · el NÚMERO va en rojo, y bajo el titular su sumario numerado;
//   · la PIEZA va en negro, y bajo el titular de qué va y de dónde sale.
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
const PAPEL = '#F4EDE4', TINTA = '#1A1614', OXBLOOD = '#7A2E2E', SUAVE = '#6B625B', LINEA = '#D9CFC2';
// La franja del número es un rojo más hondo que el acento: en miniatura, un
// bloque de 14 px del acento tira a ladrillo, y este se lee como vino.
const VINO = '#5A1F1F';

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

/** El titular manda: cuanto más largo, más pequeño, para que quepa sin recortar. */
const tamañoTitular = (t, tope) => {
  const n = String(t ?? '').length;
  return n > 110 ? tope - 12 : n > 78 ? tope - 6 : n > 46 ? tope : tope + 8;
};

/**
 * @param titulo  el titular del número o de la pieza
 * @param fecha   ya formateada («WEEKLY · 16–22 AUG 2026», «N° 43 · 25 ago 2026»)
 * @param lang    'en' | 'es' — la tarjeta habla el idioma del enlace
 * @param temas   el sumario del número: hasta cinco asuntos, en su orden
 * @param sumario una línea de qué va la pieza
 * @param fuente  de dónde sale la pieza
 */
export async function tarjeta({ titulo, fecha = '', lang = 'en', temas = [], sumario = '', fuente = '' }) {
  const esNumero = temas.length > 0;
  const vistos = temas.slice(0, 5);
  const restantes = temas.length - vistos.length;

  const svg = await satori(
    el('div', {
      style: {
        width: 1200, height: 630, flexDirection: 'column',
        backgroundColor: PAPEL, padding: '52px 68px 44px',
        borderTop: `14px solid ${esNumero ? VINO : TINTA}`,
        fontFamily: 'Spectral',
      },
    },
      el('div', { style: { justifyContent: 'space-between', alignItems: 'baseline' } },
        el('div', { style: { fontFamily: 'Fraunces', fontSize: 36, color: TINTA } },
          el('span', {}, 'Glossa'),
          el('span', { style: { color: OXBLOOD } }, '.')),
        el('div', { style: { fontSize: 20, color: SUAVE, letterSpacing: '0.08em' } }, fecha)),

      el('div', {
        style: {
          fontFamily: 'Fraunces', fontSize: tamañoTitular(titulo, esNumero ? 50 : 52),
          lineHeight: 1.12, color: TINTA, letterSpacing: '-0.015em', marginTop: 22,
        },
      }, String(titulo ?? '')),

      // El número enseña su sumario; la pieza, de qué va.
      esNumero
        ? el('div', { style: { flexGrow: 1, flexDirection: 'column', gap: 5, marginTop: 22 } },
            vistos.map((t, i) => el('div', { style: { alignItems: 'baseline', gap: 12 } },
              el('div', { style: { fontFamily: 'Fraunces', fontSize: 17, color: OXBLOOD, width: 30 } },
                String(i + 1).padStart(2, '0')),
              el('div', { style: { fontSize: 23, color: TINTA } }, t))),
            // Un sumario recortado en silencio se lee como el número entero.
            restantes > 0
              ? el('div', { style: { fontSize: 19, color: SUAVE, marginTop: 4, marginLeft: 42 } },
                  lang === 'es' ? `y ${restantes} más` : `and ${restantes} more`)
              : [])
        : el('div', { style: { flexGrow: 1, fontSize: 23, color: SUAVE, lineHeight: 1.4, marginTop: 18 } },
            String(sumario ?? '')),

      el('div', { style: { flexDirection: 'column', gap: 8 } },
        el('div', { style: { width: 110, height: 1, backgroundColor: LINEA } }),
        // Al pie, la pieza dice de dónde sale —que es por qué creerle— y el
        // número dice qué es esto, que es lo que no se sabe si es tu primera vez.
        el('div', { style: { fontSize: 21, color: SUAVE } }, esNumero ? QUE_ES[lang] ?? QUE_ES.en : (fuente || QUE_ES[lang])),
        el('div', { style: { fontSize: 18, color: OXBLOOD, letterSpacing: '0.04em' } }, 'glossa.ademas.ai')),
    ),
    { width: 1200, height: 630, fonts: FUENTES },
  );

  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
