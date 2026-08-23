// El prompt de la traducción. Vive aquí, con los otros, porque aquí está el
// criterio — y el criterio de esta es sobre todo QUÉ NO TOCAR.

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
    '- **Español de México**, no de España. Es una decisión editorial: las fuentes',
    '  en español de esta publicación son mexicanas y quien la lee está en Los',
    '  Ángeles — el peninsular sonaría prestado. En la práctica: nada de',
    '  «vosotros», nada de «coger», «vale», «ordenador» ni «móvil»; el registro',
    '  sobrio de un diario mexicano, ni coloquial ni acartonado.',
    '',
    '- Sin adjetivos de valoración que no estén en el original: si el inglés dice',
    '  «said», dice «dijo», no «admitió». Una traducción que sube la temperatura',
    '  está cambiando lo que se afirma.',
    '',
    '- Los cargos y las instituciones, en español cuando exista un uso asentado',
    '  («Secretario del Tesoro»); en su idioma cuando no lo haya.',
    '',
    '- No añadas, no resumas, no expliques. Ni una frase que no esté en el',
    '  original: es la misma pieza en otro idioma, no una versión para otro',
    '  público.',
  ].join('\n');
}
