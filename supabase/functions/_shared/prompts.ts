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
    '  "thesis": "la tesis central en una o dos frases, en español, en estilo «X sostiene que…»",',
    '  "claims": [{"claim":"afirmación concreta y falsable (cifra, fecha, programa, declaración atribuida)",',
    '              "t":"mm:ss o null si es texto", "status":"afirmado|atribuido|documentado",',
    '              "checkable":"qué habría que consultar para confirmarlo o desmentirlo"}],',
    '  "quotes": [{"text":"cita literal breve, máximo 25 palabras","t":"mm:ss o null","who":"quién"}],',
    '  "framing":"qué encuadre o supuestos de partida trae, dicho sin adjetivos",',
    '  "topics":[{"label":"tema en español, 2-5 palabras","relevance":"central|secundario"}],',
    '  "skip": false',
    '}',
    '',
    'Reglas:',
    '- En `thesis` y en `quotes`, usa SIEMPRE el nombre que confirmaste, nunca el del título.',
    '- `status`: "afirmado" si lo dice sin respaldo; "atribuido" si cita a un tercero;',
    '  "documentado" solo si remite a un documento concreto y verificable.',
    '- Nunca conviertas una opinión en un hecho. Si no distingues, usa "afirmado".',
    '- Máximo 8 claims y 5 quotes. Las citas, BREVES: sirven para localizar el pasaje,',
    '  no para reproducirlo. Nunca cites párrafos enteros.',
    '- Si no hay contenido analizable (música, directo cortado, promoción), pon "skip": true.',
    '- Los temas describen DE QUÉ trata, no quién habla. "Guerra de Irán", no "entrevista a Wilkerson".',
    '- Todo el texto de salida en español, aunque el contenido esté en otro idioma.',
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
    '{"assign":[{"slug":"el-slug-existente","relevance":"central|secundario"}],',
    ' "new":[{"slug":"kebab-case-en-español","label":"Etiqueta legible","description":"qué cae dentro y qué no","relevance":"central|secundario"}]}',
    '',
    'Reglas:',
    '- Reutiliza un tema existente siempre que encaje, aunque no sea perfecto. Crear',
    '  duplicados ("Irán", "Guerra de Irán", "Conflicto iraní") arruina la lista.',
    '- Crea uno nuevo solo si de verdad no hay dónde meterlo.',
    '- Entre 1 y 3 temas. Si todo es "central", ninguno lo es.',
    '- Alcance medio: ni "política" (inútil de tan amplio) ni "lo que dijo X el martes"',
    '  (inútil de tan estrecho).',
  ].join('\n');
}
