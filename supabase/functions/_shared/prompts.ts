// Los prompts del radar. Aquí vive su criterio editorial, así que se editan con
// el mismo cuidado que el skill.
//
// Dos reglas gobiernan todo lo de abajo:
//   1. Separar SIEMPRE lo que alguien afirma de lo que está establecido. Estas
//      fuentes son analistas con posición, no boletines.
//   2. No transcribir. Se guardan citas cortas con su minuto, que es lo que hace
//      falta para escribir y para volver a la fuente — no una copia de la obra.

export function promptDigest(item: { title: string; author?: string | null }, esTexto: boolean) {
  return [
    'Eres un analista que prepara material de lectura para alguien que no tiene tiempo de ver esto entero.',
    '',
    'METADATOS SIN VERIFICAR (vienen del feed, pueden estar equivocados):',
    `  título: ${item.title}`,
    item.author ? `  invitado según el título: ${item.author}` : '',
    '',
    esTexto
      ? 'EL TEXTO MANDA. Si no coincide con esos metadatos, ignóralos y anótalo en `title_mismatch`.'
      : 'EL AUDIO MANDA. Si lo que oyes no coincide con esos metadatos, ignóralos y describe lo que realmente hay, anotándolo en `title_mismatch`.',
    'Atribuir una afirmación a quien no la dijo destruye el valor de todo esto:',
    'nunca uses el nombre del título si no lo has confirmado en el contenido.',
    '',
    'Devuelve SOLO un objeto JSON con esta forma:',
    '{',
    '  "lang": "idioma del contenido (en|es|ru|…), no el de tu respuesta",',
    '  "title_mismatch": null o "en qué se equivoca el título respecto al contenido",',
    '  "speakers": ["quién habla o firma, con su filiación si se dice"],',
    '  "thesis": "the central thesis in one or two sentences, in English, phrased as \"X argues that…\"",',
    '  "claims": [{"claim":"afirmación concreta y falsable (cifra, fecha, programa, declaración atribuida)",',
    '              "t":"mm:ss o null si es texto", "status":"afirmado|atribuido|documentado",',
    '              "checkable":"qué habría que consultar para confirmarlo o desmentirlo"}],',
    '  "quotes": [{"text":"cita literal breve, máximo 25 palabras","t":"mm:ss o null","who":"quién"}],',
    '  "framing":"qué encuadre o supuestos de partida trae, dicho sin adjetivos",',
    '  "topics":[{"label":"topic in English, 2-5 words","relevance":"central|secundario"}],',
    '  "skip": false',
    '}',
    '',
    'Reglas:',
    '- TODO el texto que devuelvas va en INGLÉS: el panel es inglés y el sitio es EN-first.',
    '  El contenido puede estar en cualquier idioma; tu salida, no.',
    '- En `thesis` y en `quotes`, usa SIEMPRE el nombre que confirmaste, nunca el del título.',
    '- `status`: "afirmado" si lo dice sin respaldo; "atribuido" si cita a un tercero;',
    '  "documentado" solo si remite a un documento concreto y verificable.',
    '- Nunca conviertas una opinión en un hecho. Si no distingues, usa "afirmado".',
    '- Máximo 8 claims y 5 quotes. Las citas, BREVES: sirven para localizar el pasaje,',
    '  no para reproducirlo. Nunca cites párrafos enteros.',
    '- Si no hay contenido analizable (música, directo cortado, promoción), pon "skip": true.',
    '- Los temas describen DE QUÉ trata, no quién habla. "Guerra de Irán", no "entrevista a Wilkerson".',
    '- Write ALL output in English, whatever language the content is in.',
  ].filter(Boolean).join('\n');
}

export function promptTemas(digest: any, existentes: { slug: string; label: string; description?: string }[]) {
  return [
    'Clasifica este material dentro de una lista de temas que crece sola.',
    '',
    'TEMAS QUE YA EXISTEN:',
    existentes.length
      ? existentes.map(t => `- ${t.slug} · ${t.label}${t.description ? ' — ' + t.description : ''}`).join('\n')
      : '(ninguno todavía)',
    '',
    'MATERIAL:',
    JSON.stringify({ thesis: digest.thesis, topics: digest.topics, claims: (digest.claims || []).slice(0, 5) }),
    '',
    'Devuelve SOLO JSON:',
    '{"assign":[{"slug":"the-existing-slug","relevance":"central|secundario"}],',
    ' "new":[{"slug":"kebab-case-in-english","label":"Readable label","description":"what belongs in it and what does not","relevance":"central|secundario"}]}',
    '',
    'Reglas:',
    '- Etiquetas y descripciones en INGLÉS.',
    '- Reutiliza un tema existente siempre que encaje, aunque no sea perfecto. Crear',
    '  duplicados ("Irán", "Guerra de Irán", "Conflicto iraní") arruina la lista.',
    '- Crea uno nuevo solo si de verdad no hay dónde meterlo.',
    '- Entre 1 y 3 temas. Si todo es "central", ninguno lo es.',
    '- Alcance medio: ni "política" (inútil de tan amplio) ni "lo que dijo X el martes"',
    '  (inútil de tan estrecho).',
  ].join('\n');
}

/**
 * Una sección del número: el estado de un tema a partir de varias voces.
 *
 * La regla que gobierna esto es la primera de la lista y no es cosmética. En un
 * canal de entrevistas los invitados suelen compartir escuela; que coincidan
 * mide alineación, no confirmación. Un dossier que presente "tres fuentes lo
 * confirman" estaría fabricando confianza falsa, que es justo lo contrario de
 * lo que Glossa dice hacer.
 */
export function promptSeccion(tema: { label: string }, material: unknown[], anterior: unknown | null) {
  return [
    `Estado del tema «${tema.label}» a partir de material de varias voces.`,
    'Quien lo va a leer no ha visto ninguno de estos episodios. Escribe para eso.',
    '',
    'MATERIAL DE ESTE PERIODO:',
    JSON.stringify(material),
    '',
    anterior ? 'SECCIÓN ANTERIOR (para decir qué cambió):\n' + JSON.stringify(anterior) : '(no hay sección anterior)',
    '',
    'Devuelve SOLO JSON:',
    '{',
    '  "summary":"what is going on with this topic, 150-250 words, in English",',
    '  "converged":[{"point":"tesis que apareció en más de una voz","sources":["quién"],',
    '                "independent": true|false, "note":"por qué es o no es corroboración independiente"}],',
    '  "conflicts":[{"point":"sobre qué discrepan","positions":[{"who":"","says":""}]}],',
    '  "new_since_last":["qué es nuevo respecto a la sección anterior"],',
    '  "unverified":[{"claim":"afirmación que circula sin respaldo","who":"","checkable":"qué consultar"}],',
    '  "blind_spots":["qué no está diciendo ninguna de estas voces y sería relevante"],',
    '  "angles":[{"angle":"ángulo posible para una pieza","why":"qué lo hace interesante"}]',
    '}',
    '',
    'Reglas, y la primera es la que importa:',
    '- TODO el texto de salida en INGLÉS.',
    '- **Coincidir no es corroborar.** Si varias voces comparten escuela o encuadre, que digan',
    '  lo mismo mide alineación, no confirmación. Marca `independent: false` y explícalo en `note`.',
    '  Solo `true` cuando vengan de órbitas distintas y aporten evidencia separada.',
    '- No promedies las posiciones para fabricar un consenso. Si discrepan, el desacuerdo ES el hallazgo.',
    '- `blind_spots` es lo más valioso: qué falta cuando todos miran al mismo sitio.',
    '- Nada de adjetivos de valoración. Describe encuadres, no los califiques.',
    '- Esto es ANÁLISIS, no un resumen del contenido ajeno. Cita corto y atribuido, nunca',
    '  párrafos enteros: un refrito no sirve, y además el material es de terceros.',
    '- Entre 2 y 4 ángulos, y que se sostengan por escrito — no titulares.',
  ].filter(Boolean).join('\n');
}

/** La entrada del número: qué tiene de particular esta semana. */
export function promptIntro(secciones: { tema: string; summary: string }[]) {
  return [
    'Escribe la entrada de un número semanal que reúne estas secciones.',
    '',
    JSON.stringify(secciones),
    '',
    'Devuelve SOLO JSON: {"intro":"…","hilo":"…"}',
    '',
    '- `intro`: 80-120 words in English. Qué tuvo de particular la semana, no una lista',
    '  de lo que viene después. Si el lector solo lee esto, debe saber qué pasó.',
    '- `hilo`: una frase. Si algo cruzó varios temas —el mismo supuesto, el mismo actor,',
    '  la misma fecha— dilo. Si no lo cruzó, dilo también: inventar un hilo que no existe',
    '  es peor que reconocer que fue una semana dispersa.',
    '- Sin adjetivos de valoración y sin cerrar con un resumen de lo ya dicho.',
  ].join('\n');
}
