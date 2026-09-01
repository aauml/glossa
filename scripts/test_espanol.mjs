// test_espanol.mjs — el validador del español, probado contra los fallos que
// YA se publicaron. Cada caso de aquí es una frase real (o su destilación) de
// la auditoría del 2026-08-31: si el validador no los caza, no sirve; si caza
// las frases sanas, tampoco. Corre sin red y sin base: `node scripts/test_espanol.mjs`.

import { revisarEspanol, formatearFechaES, bloqueReglas, REGLAS_ES } from '../src/lib/espanol.js';

let pasan = 0, fallan = 0;
function caso(nombre, cond) {
  if (cond) { pasan++; }
  else { fallan++; console.error(`  ✗ ${nombre}`); }
}

/** Una pieza mínima con la prosa dada. */
const pieza = (md, extra = {}) => ({
  title: 'Un título en español', dek: 'Un dek en español que dice la cosa.',
  coverDek: 'Resumen de portada.', lede: 'El lede.',
  sections: [{ number: '01', title: 'Sección', standfirst: 'Entrada.',
    blocks: [{ type: 'p', md }] }],
  ...extra,
});

const reglasDe = (r) => r.fallos.map(f => f.regla);
const graveDe = (r) => r.fallos.filter(f => f.grave).map(f => f.regla);

// ── Calcos publicados de verdad ─────────────────────────────────────────
caso('caza «el primer movimiento del argumento»',
  graveDe(revisarEspanol(pieza('El primer movimiento del argumento es el que hace el trabajo pesado.'))).includes('calco'));
caso('caza «movimiento analítico»',
  graveDe(revisarEspanol(pieza('El movimiento analítico que importa llega después.'))).includes('calco'));
caso('deja en paz «movimiento» legítimo',
  !reglasDe(revisarEspanol(pieza('El movimiento obrero creció durante la década.'))).includes('calco'));
caso('caza «direccionar»',
  graveDe(revisarEspanol(pieza('Prometió direccionar el problema en el consejo.'))).includes('calco'));
caso('caza «decisores»',
  graveDe(revisarEspanol(pieza('Los decisores europeos no llegaron a un acuerdo.'))).includes('calco'));
caso('caza «a nivel de»',
  graveDe(revisarEspanol(pieza('La fragmentación es ya visible a nivel de sistema.'))).includes('calco'));
caso('caza «no rendibles»',
  graveDe(revisarEspanol(pieza('Produce sistemas no rendibles ante nadie.'))).includes('calco'));
caso('avisa de «está siendo preparada» sin bloquear',
  (() => { const r = revisarEspanol(pieza('Una herramienta está siendo preparada para otra cosa.'));
    return reglasDe(r).includes('calco') && !graveDe(r).includes('calco'); })());
caso('caza «vosotros»',
  graveDe(revisarEspanol(pieza('Como vosotros sabéis, el acuerdo se firmó en marzo.'))).includes('registro'));
caso('avisa del gerundio encadenado («, matando a cientos») sin bloquear',
  (() => { const r = revisarEspanol(pieza('Un glaciar colapsó en la frontera, matando a cientos de personas.'));
    return reglasDe(r).includes('calco') && !graveDe(r).includes('calco'); })());
caso('no acusa «, cuando llegó»',
  !reglasDe(revisarEspanol(pieza('El acuerdo se rompió, cuando llegó la contraoferta de Ottawa.'))).includes('calco'));
caso('caza «entre un amanecer y otro»',
  graveDe(revisarEspanol(pieza('El partido dejó caer al gobernador entre un amanecer y otro.'))).includes('calco'));

// ── Campos en inglés ────────────────────────────────────────────────────
caso('caza el title liso en inglés',
  graveDe(revisarEspanol(pieza('Prosa normal en español.', { title: 'The seven-month doubling of machine capability' })))
    .includes('campo en inglés'));
caso('caza el rótulo interrogativo inglés',
  graveDe(revisarEspanol(pieza('Prosa.', { sections: [{ number: '01', title: 'S', standfirst: 'E.',
    blocks: [{ type: 'context', label: 'What is Pemex?', md: 'Texto.' }] }] }))).includes('campo en inglés'));
caso('caza el source en inglés',
  graveDe(revisarEspanol(pieza('Prosa.', { source: 'Based on Financial Times reporting' }))).includes('campo en inglés'));
caso('no acusa a un título español con un nombre propio inglés',
  !reglasDe(revisarEspanol(pieza('Prosa.', { title: 'Lo que Breaking Points no quiso decir' }))).includes('campo en inglés'));
caso('caza el mes inglés en la prosa',
  graveDe(revisarEspanol(pieza('La reunión del 17 May 2026 no llegó a nada.'))).includes('mes en inglés'));
caso('no confunde «Mar Negro» con el mes',
  !reglasDe(revisarEspanol(pieza('La flota cruzó el Mar Negro rumbo al Mar del Norte en marzo.'))).includes('mes en inglés'));
caso('no confunde a Theresa May con el mes',
  !reglasDe(revisarEspanol(pieza('Theresa May dejó el cargo antes del acuerdo.'))).includes('mes en inglés'));

// ── Cifras (convención mexicana) ────────────────────────────────────────
caso('caza «51,7 por ciento» (decimal peninsular)',
  graveDe(revisarEspanol(pieza('El modelo alcanzó el 51,7 por ciento en la prueba.'))).includes('formato de cifra'));
caso('acepta «51.7%» (mexicana)',
  !reglasDe(revisarEspanol(pieza('El modelo alcanzó el 51.7% en la prueba.'))).includes('formato de cifra'));
caso('avisa de «160.000» (millares con punto) sin bloquear',
  (() => { const r = revisarEspanol(pieza('Pagó 160.000 millones de dólares por ello.'));
    return reglasDe(r).includes('formato de cifra') && !graveDe(r).includes('formato de cifra'); })());
caso('acepta «800,000 etiquetas» (millares a la mexicana)',
  !reglasDe(revisarEspanol(pieza('Usaron 800,000 etiquetas en 12,000 problemas.'))).includes('formato de cifra'));
caso('no toca una cifra dentro de una cita',
  !graveDe(revisarEspanol(pieza('Dijo que «el 51,7 por ciento no es un dato menor».'))).includes('formato de cifra'));

// ── El paréntesis del billion, contra el original ───────────────────────
const enBillion = pieza('The plan costs $130 billion over a decade.');
caso('exige «(130 billion)» cuando el original dice billion',
  graveDe(revisarEspanol(pieza('El plan cuesta 130 mil millones de dólares en una década.'), enBillion))
    .includes('cifra sin equivalente'));
caso('acepta el paréntesis puesto',
  !reglasDe(revisarEspanol(pieza('El plan cuesta 130 mil millones de dólares (130 billion) en una década.'), enBillion))
    .includes('cifra sin equivalente'));
caso('no lo exige si el original no tiene billones',
  !reglasDe(revisarEspanol(pieza('El plan cuesta 900 millones.'), pieza('The plan costs 900 million.')))
    .includes('cifra sin equivalente'));

// ── Paridad estructural ─────────────────────────────────────────────────
const enDosBloques = pieza('First paragraph with some words in it, enough to count as prose here.', {
  sections: [{ number: '01', title: 'S', standfirst: 'E.', blocks: [
    { type: 'p', md: 'One.' }, { type: 'context', label: 'What is X?', md: 'Box.' }] }] });
caso('caza una caja perdida en la edición española',
  graveDe(revisarEspanol(pieza('Un párrafo.'), enDosBloques)).includes('estructura divergente'));
caso('caza marcas doc/attr/said perdidas',
  graveDe(revisarEspanol(
    pieza('El estrecho sigue abierto según el gobierno.'),
    pieza('The strait <span class="said">remains open</span> according to the government.')))
    .includes('marcas perdidas'));
caso('caza un span sin cerrar',
  graveDe(revisarEspanol(pieza('El dato <span class="doc">consta en el expediente y ahí se queda.')))
    .includes('aparato mal formado'));

// ── La edición recortada (el caso bradford, ratio 0.84) ─────────────────
const parrafoEN = 'This is a long paragraph of English prose meant to stand in for a full piece. '.repeat(20);
const parrafoES = 'Este es un párrafo largo de prosa española que hace de pieza entera para la prueba. '.repeat(15);
caso('caza la edición recortada (ratio < 0.95)',
  graveDe(revisarEspanol(pieza(parrafoES), pieza(parrafoEN + parrafoEN))).includes('edición recortada'));
caso('acepta una edición un 15% más larga',
  !reglasDe(revisarEspanol(pieza(parrafoES + parrafoES + parrafoES), pieza(parrafoEN + parrafoEN)))
    .includes('edición recortada'));

// ── La forma del semanal también se entiende ────────────────────────────
const semanalES = { headline: 'La semana en que todo se movió', standfirst: 'Entrada en español.',
  pieces: [{ subject: 'Energía', title: 'Título en español', dek: 'Dek en español.',
    body: 'El primer movimiento del argumento es una periodización.' }] };
caso('el semanal pasa por los mismos calcos',
  graveDe(revisarEspanol(semanalES)).includes('calco'));

// ── Utilidades ──────────────────────────────────────────────────────────
caso('formatearFechaES da «de» y minúscula',
  formatearFechaES(new Date('2026-08-25T19:00:00Z')) === '25 de agosto de 2026');
caso('bloqueReglas lleva todos los calcos con alternativa',
  REGLAS_ES.calcos.filter(c => c.bien).every(c => bloqueReglas().includes(c.en)));

console.log(`\n${pasan} pasan · ${fallan} fallan`);
process.exit(fallan ? 1 : 0);
