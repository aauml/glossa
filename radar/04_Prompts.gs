/**
 * Los prompts. Aquí vive el criterio editorial del radar, así que se editan con
 * el mismo cuidado que el skill.
 *
 * Dos reglas gobiernan los dos prompts:
 *   1. Separar SIEMPRE lo que alguien afirma de lo que está establecido. Estas
 *      fuentes son analistas con posición, no boletines: "X sostiene que" no es
 *      lo mismo que "ocurrió".
 *   2. No transcribir. Se guardan citas cortas con su minuto, que es lo que hace
 *      falta para escribir y para volver a la fuente.
 */

function promptDigest_(item) {
  return [
    'Eres un analista que prepara material de lectura para alguien que no tiene tiempo de ver esto entero.',
    '',
    'METADATOS SIN VERIFICAR (vienen del RSS del canal, pueden estar equivocados):',
    `  título: ${item.title}`,
    item.author ? `  invitado según el título: ${item.author}` : '',
    '',
    'EL AUDIO MANDA. Si lo que oyes no coincide con esos metadatos, ignóralos y describe lo',
    'que realmente hay, anotándolo en `title_mismatch`. Atribuir una afirmación a quien no la',
    'dijo destruye el valor de todo esto: nunca uses el nombre del título si no lo has oído.',
    '',
    'Escucha y devuelve SOLO un objeto JSON con esta forma:',
    '{',
    '  "lang": "idioma HABLADO en el episodio (en|es|ru|…), no el de tu respuesta",',
    '  "title_mismatch": null o "en qué se equivoca el título respecto a lo que oíste",',
    '  "speakers": ["quién habla, nombre y filiación si se dice"],',
    '  "thesis": "la tesis central en una o dos frases, en español, en estilo «X sostiene que…»",',
    '  "claims": [',
    '    {"claim":"afirmación concreta y falsable (cifra, fecha, programa, declaración atribuida)",',
    '     "t":"mm:ss", "status":"afirmado|atribuido|documentado",',
    '     "checkable":"qué habría que consultar para confirmarlo o desmentirlo"}',
    '  ],',
    '  "quotes": [{"text":"cita literal breve, máximo 25 palabras","t":"mm:ss","who":"quién"}],',
    '  "framing":"qué encuadre o supuestos de partida trae, dicho sin adjetivos",',
    '  "topics":[{"label":"tema en español, 2-5 palabras","relevance":"central|secundario"}],',
    '  "skip": false',
    '}',
    '',
    'Reglas:',
    '- En `thesis` y en `quotes`, usa SIEMPRE el nombre que oíste, nunca el del título.',
    '- `status`: "afirmado" si el hablante lo dice sin respaldo; "atribuido" si cita a un tercero;',
    '  "documentado" solo si remite a un documento concreto y verificable.',
    '- Nunca conviertas una opinión en un hecho. Si no distingues, usa "afirmado".',
    '- Máximo 8 claims y 5 quotes. Las citas, breves: son para localizar el pasaje, no para reproducirlo.',
    '- Si el episodio no tiene contenido analizable (música, directo cortado, promoción), pon "skip": true.',
    '- Los temas describen DE QUÉ trata, no quién habla. "Guerra de Irán", no "entrevista a Wilkerson".',
    '- Todo el texto de salida en español, aunque el episodio esté en otro idioma.',
  ].filter(Boolean).join('\n');
}

function promptTopics_(digest, existentes) {
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
    '{"assign":[{"slug":"el-slug-existente","relevance":"central|secundario"}],',
    ' "new":[{"slug":"kebab-case-en-español","label":"Etiqueta legible","description":"qué cae dentro y qué no","relevance":"central|secundario"}]}',
    '',
    'Reglas:',
    '- Reutiliza un tema existente siempre que encaje, aunque no sea perfecto. Crear duplicados',
    '  ("Irán", "Guerra de Irán", "Conflicto iraní") rompe la utilidad de la lista.',
    '- Crea uno nuevo solo si de verdad no hay dónde meterlo.',
    '- Entre 1 y 3 temas por material. Si todo es "central", ninguno lo es.',
    '- Temas de alcance medio: ni "política" (inútil de tan amplio) ni "declaración de Wilkerson del martes" (inútil de tan estrecho).',
  ].join('\n');
}

function promptDossier_(topic, digests, anterior) {
  return [
    `Estado del tema «${topic.label}» a partir de material de varias fuentes.`,
    'Quien lo va a leer no ha visto ninguno de estos episodios. Escribe para eso.',
    '',
    'MATERIAL DE ESTE PERIODO:',
    JSON.stringify(digests),
    '',
    anterior ? 'DOSSIER ANTERIOR (para decir qué cambió):\n' + JSON.stringify(anterior) : '(no hay dossier anterior)',
    '',
    'Devuelve SOLO JSON:',
    '{',
    '  "summary":"qué está pasando con este tema, 150-250 palabras, en español",',
    '  "converged":[{"point":"tesis que apareció en más de una fuente",',
    '                "sources":["quién"], "independent": true|false,',
    '                "note":"por qué es o no es corroboración independiente"}],',
    '  "conflicts":[{"point":"sobre qué discrepan","positions":[{"who":"","says":""}]}],',
    '  "new_since_last":["qué es nuevo respecto al dossier anterior"],',
    '  "unverified":[{"claim":"afirmación que circula sin respaldo","who":"","checkable":""}],',
    '  "blind_spots":["qué no está diciendo ninguna de estas fuentes y sería relevante"],',
    '  "angles":[{"angle":"ángulo posible para una pieza","why":"qué lo hace interesante"}]',
    '}',
    '',
    'Reglas, y la primera es la que importa:',
    '- **Coincidir no es corroborar.** Si varias fuentes comparten escuela o encuadre, que digan',
    '  lo mismo mide alineación, no confirmación. Marca `independent: false` y dilo en `note`.',
    '  Solo pon `true` cuando las fuentes vengan de órbitas distintas y aporten evidencia separada.',
    '- No promedies las posiciones para fabricar un consenso. Si discrepan, el desacuerdo ES el hallazgo.',
    '- `blind_spots` es lo más valioso del dossier: qué falta cuando todos miran al mismo sitio.',
    '- Nada de adjetivos de valoración. Describe encuadres, no los califiques.',
    '- Entre 2 y 4 ángulos. Deben ser cosas que se sostengan por escrito, no titulares.',
  ].filter(Boolean).join('\n');
}
