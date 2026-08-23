// El prompt de la traducción. Vive aquí, con los otros, porque aquí está el
// criterio — y el criterio de esta es sobre todo QUÉ NO TOCAR.

/**
 * El número en español.
 *
 * Las citas SÍ se traducen — y por eso dejan de llevar comillas.
 *
 * La primera versión las dejaba en inglés dentro de la prosa española, para que
 * una comilla siguiera significando «palabras exactas». Se leía mal y confundía:
 * el lector no sabe si eso es un descuido o una decisión.
 *
 * La salida no es elegir entre fidelidad y legibilidad, es cambiar la marca
 * tipográfica. En español la voz ajena va en CURSIVA, sin comillas: se lee bien,
 * se entiende, y no afirma ser literal — porque no lo es, es una traducción. Las
 * comillas son la promesa que no se puede cumplir en otro idioma; la cursiva no
 * promete eso.
 *
 * Lo que el fusible comprueba entonces cambia: ya no puede comparar letra por
 * letra contra un material que está en inglés, así que comprueba que no se haya
 * INVENTADO ninguna — que en español no haya más voces citadas que en el
 * original.
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
    '- **LAS CITAS SE TRADUCEN, Y PIERDEN LAS COMILLAS.** Toda frase que en el',
    '  original vaya entre comillas se traduce al español y se marca con',
    '  *asteriscos* —que se pintan en cursiva—, SIN comillas de ningún tipo.',
    '',
    '    inglés:   He said "the strait is open and operating normally"',
    '    español:  Dijo que *el estrecho está abierto y funciona con normalidad*',
    '',
    '  El motivo importa y no es de estilo: unas comillas afirman que esas son',
    '  las palabras exactas de alguien, y una traducción nunca lo es. La cursiva',
    '  dice «esto es lo que dijo» sin prometer literalidad, que es exactamente lo',
    '  que una traducción puede sostener.',
    '',
    '  NO inventes citas que no estén en el original, y no conviertas en cita algo',
    '  que allí era prosa normal: en español tiene que haber las MISMAS voces',
    '  citadas que en inglés, ni una más.',
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
