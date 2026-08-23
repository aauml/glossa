// Los prompts del reportaje. Aquí vive el criterio, así que se editan con el
// mismo cuidado que `prompts_cotejo.mjs` y `_shared/prompts.ts`.
//
// Son dos, y están separados a propósito:
//
//   `promptConsultas` decide QUÉ preguntarle al mundo. Es lo único que una
//   palabra clave no sabe hacer: la etiqueta de un tema —«Security dynamics in
//   the Middle East»— no es una consulta, y buscarla devuelve teletipo.
//
//   `promptReporte` lee lo que volvió. NO es `promptDigest`, y esa es la
//   decisión que sostiene todo lo demás. `promptDigest` pide una tesis en forma
//   «X argues that…», un encuadre y una lista de hablantes. Pasado por un
//   despacho de Reuters produce «Reuters argues that…»: fabrica una voz a partir
//   de un reporte. Es exactamente el aplanamiento contra el que existe esta
//   publicación, reproducido un piso más abajo, y dejaría los reportes
//   indistinguibles de los episodios POR CONSTRUCCIÓN, dijera lo que dijera el
//   prompt del número después.

/**
 * Consultas para salir a buscar un tema fuera de las fuentes seguidas.
 *
 * @param tema     {label, description}
 * @param material afirmaciones y tesis concretas del tema esta semana — de aquí
 *                 sale el ángulo; de la etiqueta no sale ninguno
 * @param pista    en las rondas siguientes, qué divergencia hay que perseguir
 *                 (una cifra que no cuadra, un país del que no volvió nada)
 * @param yaVistos dominios que ya contestaron, para no volver a pedir lo mismo
 */
export function promptConsultas(tema, material, pista = '', yaVistos = []) {
  return [
    'A weekly review follows ~22 commentary channels. This week they kept returning',
    'to one subject. Your job is to write the search queries that will find what was',
    'actually REPORTED about it — by outlets nobody here follows, in the countries',
    'the story touches.',
    '',
    'THE SUBJECT:',
    `  ${tema.label}`,
    tema.description ? `  ${tema.description}` : '',
    '',
    'WHAT THE CHANNELS SAID ABOUT IT — use this for the angle. The label above is a',
    'classifier\'s abstraction and is usually unsearchable; the concrete thing is here:',
    material.map(m => `  - ${m}`).join('\n') || '  (nothing concrete)',
    '',
    yaVistos.length ? `ALREADY ANSWERED, do not aim at these again: ${yaVistos.join(', ')}` : '',
    pista ? `\nCHASE THIS — the last round left something open:\n  ${pista}` : '',
    '',
    'Return ONLY JSON:',
    '{"countries":["ISO-2, at most 3, ONLY where the story materially happens"],',
    ' "queries":[{"q":"the query","lang":"ISO-639-1","terms":"3-5 keywords","why":"what this one is meant to surface"}]}',
    '',
    'RULES:',
    '',
    '- `terms` is the SAME search reduced to 3-5 bare keywords: proper nouns, numbers,',
    '  acronyms. No verbs, no prepositions, no year unless the story is about a date.',
    '  It is used against a news index that ANDs every word together, where a',
    '  twelve-word query matches nothing. Prefer names that survive translation:',
    '  "Trump Iran Hormuz" finds Le Parisien and CBS with the same three words,',
    '  which is how one query can sweep forty countries without being translated.',
    '- Return exactly 2 queries. Two good ones beat four vague ones, and each one',
    '  costs a search.',
    '',
    '- A query that returns the outlets already in the material buys nothing. Ask what',
    '  a reporter in the country concerned would have filed: what happened, who said it',
    '  on the record, what document was published.',
    '',
    '- Do not ask for opinion, analysis, commentary or "experts". Those are what this',
    '  review already has too much of.',
    '',
    '- Write the query in the language that country\'s press publishes in. A Spanish',
    '  query is NOT a translation of the English one — it is the query a Mexican editor',
    '  would actually type, with the words that country\'s press uses for the thing.',
    '',
    '- `countries` is where the story HAPPENS or who it is done to, not who is talking',
    '  about it. American commentary about Iran is a story that touches Iran. Leave it',
    '  empty rather than pad it.',
    '',
    '- Names, numbers, dates and place names are what make a news query work. A query',
    '  with no proper noun in it will return nothing usable.',
  ].filter(Boolean).join('\n');
}

/**
 * Lee un artículo que volvió de la búsqueda. Deliberadamente NO produce tesis,
 * encuadre ni hablantes: un reporte no es una voz, y darle una lo convertiría en
 * un comentarista más.
 */
export function promptReporte(articulo, tema) {
  return [
    'You are reading one news report so a weekly review can use it as REPORTING —',
    'as the thing its commentary sources can be measured against.',
    '',
    'It was fetched because the week clustered around this subject:',
    `  ${tema.label}`,
    '',
    'THE DOCUMENT:',
    `  outlet: ${articulo.sitio}`,
    `  title: ${articulo.titulo}`,
    `  published: ${articulo.fecha ?? 'unknown'}`,
    `  text:`,
    String(articulo.texto ?? '').slice(0, 18_000),
    '',
    'Return ONLY JSON:',
    '{',
    '  "lang":"language the article is written in (en|es|fr|tr|…), not the language of your answer",',
    '  "outlet":"the publication",',
    '  "byline":"the reporter, or null",',
    '  "country":"ISO-2 this was filed from, or null",',
    '  "wire":"reuters|ap|afp|efe|other|none — the agency this came through, if any",',
    '  "what_happened":"what this report says OCCURRED. English. 2-4 sentences. Not a thesis.",',
    '  "attributed":[{"who":"named person or body, with their role","what":"what they said on the record, in English"}],',
    '  "figures":[{"figure":"the number as printed","measures":"what it measures","published_by":"who published it, per this report"}],',
    '  "records":["documents this report NAMES — a bill number, a docket, a dataset, a ruling"],',
    '  "quotes":[{"text":"verbatim, in the article\'s own language, max 25 words","who":"who said it"}],',
    '  "not_covered":"what this report says is still unknown, unconfirmed or disputed, or null",',
    '  "bears_on_topic": true,',
    '  "skip": false',
    '}',
    '',
    'RULES:',
    '',
    '- A report\'s value is its REPORTING, not its opinion. Do not summarise what the',
    '  outlet thinks, and never write that it "argues", "believes" or "warns". Record',
    '  who was on the record, what documents it names, what numbers it publishes and',
    '  who published them.',
    '',
    '- `what_happened` and `attributed[].what` go in ENGLISH even when the article is',
    '  not. They are PARAPHRASE, and they are what makes a report in another language',
    '  usable at all.',
    '',
    '- `quotes` stay in the language the article is written in. NEVER translate them.',
    '  A translated string presented as a quotation is the one error this publication',
    '  cannot afford, and downstream every quotation is checked against these exactly.',
    '  Max 3, and short: they locate a passage, they do not reproduce the piece.',
    '',
    '- `records` names documents the report POINTS AT. Naming a record is not being',
    '  one — a newspaper describing a ruling is not the ruling.',
    '',
    '- `wire`: if the text carries an agency credit — (Reuters), (AP), Agence',
    '  France-Presse, (EFE) — name it. Several outlets carrying one agency dispatch is',
    '  one report, not several, and this field is how that gets counted.',
    '',
    '- `bears_on_topic: false` if this is about something else. Being about a',
    '  neighbouring subject is not bearing on it, and a false positive here costs more',
    '  than a miss.',
    '',
    '- `skip: true` if this is not a report at all: an opinion column, an editorial, a',
    '  transcript of an interview or podcast, a listicle, an aggregator stub, a press',
    '  release reprinted whole, or a page that is mostly navigation. A transcript of a',
    '  commentary show is exactly what this review already has, and letting one in',
    '  dressed as reporting is worse than finding nothing.',
  ].filter(Boolean).join('\n');
}
