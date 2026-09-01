// El prompt de la traducción. Vive aquí, con los otros, porque aquí está el
// criterio — y el criterio de esta es sobre todo QUÉ NO TOCAR.
//
// Las reglas de lengua (calcos, cifras, registro mexicano) vienen de
// `src/lib/espanol.js`: la MISMA lista que interpola el prompt de la pieza y
// que valida `revisarEspanol`. Una regla que se quiera añadir se añade allí.

import { bloqueReglas } from '../src/lib/espanol.js';

/**
 * El número en español.
 *
 * Las citas se traducen y van entre comillas latinas, como en cualquier
 * periódico: «así». No es una traducción literal palabra por palabra y no tiene
 * por qué serlo — es una decisión editorial, y la buena es que se lea natural.
 *
 * Se probó antes dejarlas en inglés dentro de la prosa española, y luego
 * traducirlas en cursiva sin comillas. Las dos eran soluciones rigurosas a un
 * problema que no existe: nadie lee «dijo que el estrecho está abierto» en un
 * diario español y entiende que esas fueron las sílabas exactas. La convención
 * ya significa «esto dijo», no «esto sonó así».
 *
 * Lo que el fusible comprueba, entonces, es lo único comprobable en otro idioma:
 * que no se haya INVENTADO ninguna voz — que no haya en español más gente
 * citada que en el original.
 */
export function promptTraduccion(numero) {
  return [
    'Traduce al español este número de una revista semanal. Devuelve SOLO JSON,',
    'con EXACTAMENTE la misma forma que recibes: las mismas claves, el mismo',
    'número de piezas, el mismo orden, los mismos ids en "sources".',
    '',
    JSON.stringify(numero),
    '',
    'REGLAS — la primera es la que importa y no admite excepción:',
    '',
    '- **ERES EL MISMO EDITOR ESCRIBIENDO ESTE NÚMERO EN ESPAÑOL**, no un',
    '  traductor a sueldo de otro. Rehaz la frase, cambia la imagen, reordena el',
    '  párrafo, glosa lo que un lector mexicano necesita. Libertad total en la',
    '  FORMA. Ninguna en los HECHOS: las mismas afirmaciones, las mismas marcas',
    '  sobre las mismas afirmaciones, ni una cita de más, ni una cifra cambiada.',
    '',
    '- **ESTO ES UNA INTERPRETACIÓN, NO UN CALCO.** La sintaxis española no es la',
    '  inglesa con palabras españolas: reordena, parte, une, cambia el verbo,',
    '  quita los posesivos que el inglés necesita y el español no. La prueba es si',
    '  un lector adivinaría que se escribió en español. Una frase que solo',
    '  funciona porque conserva la forma inglesa está mal aunque cada palabra sea',
    '  correcta.',
    '',
    '  ANTES DE DEVOLVER, relee tu español con una sola pregunta: ¿alguna frase',
    '  delata que se escribió primero en inglés? La que lo delate se reescribe',
    '  desde su sentido, no desde sus palabras. Ese repaso no es opcional.',
    '',
    bloqueReglas(),
    '',
    '- El español ocupa un 15-20 % más que el inglés, así que el tope viaja con él:',
    '  ninguna frase por encima de 40 palabras. Donde el inglés partió una frase en',
    '  dos, el español puede necesitar tres. Y donde el inglés encadenó con punto y',
    '  coma, en español se pone punto.',
    '',
    '- **LAS CITAS SE TRADUCEN**, y van entre comillas latinas «así», como en',
    '  cualquier periódico en español.',
    '',
    '    inglés:   He said "the strait is open and operating normally"',
    '    español:  Dijo que «el estrecho está abierto y funciona con normalidad»',
    '',
    '  Que suene natural importa más que calcar la sintaxis: es una traducción,',
    '  no un doblaje. Si el orden inglés queda forzado en español, cámbialo.',
    '',
    '  Lo único que NO se puede hacer es inventar. En español tiene que haber las',
    '  mismas voces citadas que en inglés —ni una más— y ninguna frase puede',
    '  pasar a ser cita si en el original era prosa normal.',
    '',
    '- Conserva EXACTAMENTE las marcas del aparato, sin traducir el atributo:',
    '    <span class="doc">…</span>   <span class="attr">…</span>   <span class="said">…</span>',
    '  El texto de dentro sí se traduce (salvo que esté entrecomillado). Marcan la',
    '  fuerza de la afirmación, no el idioma.',
    '',
    '- No traduzcas nombres propios, de medios ni de programas: «Breaking Points»',
    '  es «Breaking Points», no «Puntos de Ruptura». Tampoco los dominios.',
    '',
    '- `subject` es la etiqueta del índice: tradúcela, corta, 2-4 palabras.',
    '- `sources` y `sources_index` se copian TAL CUAL. Son ids, no texto.',
    '',
    '- No INVENTES: glosar lo que un lector mexicano necesita es parte de la',
    '  edición (la regla primera lo permite), pero ninguna afirmación nueva,',
    '  ninguna cifra nueva, ninguna voz citada que el original no cite. Y no',
    '  resumas: lo que el original dice, la edición lo dice entero.',
  ].join('\n');
}
