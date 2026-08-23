// El prompt de la traducción. Vive aquí, con los otros, porque aquí está el
// criterio — y el criterio de esta es sobre todo QUÉ NO TOCAR.

/**
 * El número en español.
 *
 * La regla que gobierna todo lo demás: **las comillas no se traducen**. En una
 * publicación cuya premisa es que una frase entrecomillada son palabras
 * literales, traducirlas convertiría en paráfrasis lo que se presenta como cita
 * —y el fusible, que compara cada comilla con el material original en inglés,
 * dejaría de proteger la versión española sin que nadie lo notara—.
 *
 * Que el fusible corra también sobre esta traducción no es un extra: es lo que
 * hace comprobable la regla.
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
    '- **NO TRADUZCAS NADA QUE ESTÉ ENTRE COMILLAS.** Toda frase entrecomillada',
    '  —comillas rectas o tipográficas— se copia LETRA POR LETRA, en inglés, sin',
    '  tocar una coma. Esta publicación afirma que una comilla son las palabras',
    '  exactas de alguien; traducirlas la convertiría en mentira. Si te resulta',
    '  raro leer una cita en inglés dentro de una frase en español: es correcto y',
    '  es deliberado, y es lo que hace la prensa seria.',
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
    '- Español de España, neutro y sobrio. Sin adjetivos de valoración que no',
    '  estén en el original: si el inglés dice «said», dice «dijo», no «admitió».',
    '  Una traducción que sube la temperatura está cambiando lo que se afirma.',
    '',
    '- Los cargos y las instituciones, en español cuando exista un uso asentado',
    '  («Secretario del Tesoro»); en su idioma cuando no lo haya.',
    '',
    '- No añadas, no resumas, no expliques. Ni una frase que no esté en el',
    '  original: es la misma pieza en otro idioma, no una versión para otro',
    '  público.',
  ].join('\n');
}
