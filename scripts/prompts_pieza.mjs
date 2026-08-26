// Los prompts de la pieza suelta. Aquí vive la voz, así que se editan con el
// mismo cuidado que `skills/references/editorial-conventions.md`, del que este
// archivo es la destilación operativa: lo que allí se le explica a Claude en
// conversación, aquí se le exige a Kimi por contrato JSON.
//
// La decisión de fondo (elegida por Arturo, 2026-08-24): las piezas del
// pipeline automático las escribe Kimi imitando la voz de la colección, no
// Claude por API. Por eso el prompt no confía en que el modelo «conozca» el
// estilo: lo lleva entero, con las reglas que en cuarenta piezas demostraron
// ser las que producen el formato — y el guion valida el contrato al volver.
//
// Kimi devuelve JSON, nunca MDX. El MDX lo arma el guion: un modelo que emite
// markup inventa componentes, cierra mal las etiquetas y rompe el build; un
// modelo que llena un contrato JSON solo puede equivocarse en el contenido,
// que es donde sí se le quiere dejar libertad.

/** Digerir la fuente cuando llegó sin pasar por el radar. Adaptación en Node
 *  del promptDigest del radar (que vive en TS de Deno y no se puede importar):
 *  mismas reglas de atribución, misma separación afirmado/atribuido/documentado. */
export function promptDigestPieza(item, esTexto) {
  return [
    'You are preparing source material so an editor can write a guided reading of it.',
    '',
    'WHERE THIS CAME FROM. The URL and the outlet are FACTS — they are how the',
    'material reached us, not something inferred from the text:',
    `  title: ${item.title}`,
    item.url ? `  url: ${item.url}` : '',
    item.author ? `  byline: ${item.author}` : '',
    item.fuente ? `  followed source: ${item.fuente}` : '',
    '',
    'NEVER call this source anonymous, unsigned or unattributed when a byline, a',
    'followed source or the URL identifies it. A column at',
    'elfinanciero.com.mx/opinion/raymundo-riva-palacio/ is by Raymundo Riva Palacio',
    'in El Financiero even if his name never appears in the body text. If the text',
    'itself carries no byline AND nothing above identifies it, say that the text as',
    'received carries no byline — not that the author is unknown to the world.',
    '',
    esTexto
      ? 'THE TEXT RULES. If it disagrees with the metadata, ignore the metadata.'
      : 'THE AUDIO/VIDEO RULES. If what you hear disagrees with the metadata, describe what is actually there.',
    'Never attribute a claim to a name you did not confirm in the content itself.',
    '',
    'Return ONLY a JSON object:',
    '{',
    '  "lang": "language of the content (en|es|ru|…)",',
    '  "speakers": ["who speaks or signs, with affiliation if stated"],',
    '  "kind": "interview|lecture|article|essay|report|thread|other",',
    '  "thesis": "the central thesis, 1-2 sentences, English, phrased as \\"X argues that…\\"",',
    '  "outline": ["the 4-8 moves the source makes, in order — this is what the sections of the reading will follow"],',
    '  "claims": [{"claim":"concrete falsifiable claim (figure, date, program, attributed statement)",',
    '              "t":"mm:ss or null","status":"afirmado|atribuido|documentado",',
    '              "checkable":"what one would consult to confirm or refute it"}],',
    '  "quotes": [{"text":"verbatim quote, max 40 words","t":"mm:ss or null","who":"who said it"}],',
    '  "framing":"the frame and starting assumptions, stated without adjectives",',
    '  "context_needed": ["terms, institutions or episodes the source assumes and a careful general reader would want explained"],',
    '  "mentions": [{"name":"person or outlet the source cites AS ITS SOURCE","kind":"person|outlet|institution|work","cited_for":"what for"}],',
    '  "skip": false',
    '}',
    '',
    'Rules:',
    '- ALL output in ENGLISH regardless of the content language.',
    '- "status": "afirmado" if said without support; "atribuido" if citing a third party;',
    '  "documentado" only if it points at a concrete verifiable record.',
    '- Up to 10 claims, up to 8 quotes. Quotes locate passages — never whole paragraphs.',
    '- `outline` matters most here: it is the skeleton the piece will be built on.',
    '- If there is nothing analyzable, set "skip": true.',
  ].filter(Boolean).join('\n');
}

/** Consultas para traer contexto de fuera. Menos ambicioso que el del
 *  reportaje: una pieza necesita 2-3 documentos que anclen o contradigan a la
 *  fuente, no un censo de prensa mundial. */
export function promptConsultasPieza(digest) {
  return [
    'An editor is about to write a guided reading of ONE source. Before writing,',
    'they want a small number of outside documents: reporting or records that',
    'CONFIRM, CONTRADICT or GROUND the source\'s most checkable claims.',
    '',
    'THE SOURCE SAYS:',
    `  thesis: ${digest.thesis}`,
    ...(digest.claims || []).slice(0, 6).map(c => `  - ${c.claim} (${c.status}; check: ${c.checkable})`),
    '',
    'Return ONLY JSON:',
    '{"queries":[{"q":"the query","lang":"ISO-639-1","why":"which claim this checks"}]}',
    '',
    'Rules:',
    '- Exactly 2 queries. Each costs money. Aim them at the two claims whose',
    '  confirmation or refutation would most change how the piece is framed.',
    '- Ask for reporting and records — names, numbers, dates, document titles —',
    '  never for opinion or commentary.',
  ].join('\n');
}

// La voz, destilada de `skills/references/editorial-conventions.md`. Si aquello
// cambia, esto cambia con ello.
const VOZ = [
  'THE VOICE — this format is validated across forty issues; match it, do not reinvent it:',
  '',
  '- THIS IS GLOSSA\'S ARTICLE. Not a review of someone else\'s article — an article,',
  '  by a publication that read the material, checked what could be checked, and now',
  '  reports it. Write it as the reporter who takes the sourcing as his own: state',
  '  it. "A quiet search for asylum ran through three capitals" — never "the author',
  '  describes a quiet search for asylum". Handing every sentence back to the source',
  '  ("the columnist argues", "he describes", "in his account") is not caution, it is',
  '  abdication: it makes an academic paper out of something that is not one, it',
  '  wastes the reader\'s attention, and it bores.',
  '',
  '  BANNED, and this is not a style preference — these sentences do the reader\'s',
  '  thinking out loud instead of doing the work:',
  '    · Telling the reader how to read the source: "take the following as one',
  '      journalist\'s account", "this piece is a guided reading of…", "read it the',
  '      way diplomats read unsigned cables".',
  '    · Describing the TEXT instead of the world: "the column treats this as',
  '      settled", "the author names no sources", "it carries no byline".',
  '    · A context box introducing WHO THE SOURCE IS ("Who is X?") or how much to',
  '      trust them. Context boxes are for what the READER needs about the SUBJECT —',
  '      an institution, a treaty, a term. Never about the byline.',
  '  Provenance is not prose: it lives in the marks, in the source line under the',
  '  headline and in the sources at the foot, all three of which the page prints on',
  '  its own.',
  '',
  '  What carries the caution instead is the MARK. Every claim that is not settled',
  '  wears one, inline, and the reader learns to read them in one line:',
  '    · <span class="doc">…</span>   traceable to a named document or record',
  '    · <span class="attr">…</span>  only this one source says it',
  '    · <span class="said">…</span>  asserted, and nothing found supports it',
  '  Unmarked prose means checked. Wrap the CLAIM, not the paragraph: a few words,',
  '  the figure, the assertion itself. Use the digest\'s own status for each claim —',
  '  documentado → doc, atribuido → attr, afirmado → said — and upgrade a claim to',
  '  unmarked only when an outside document in this material confirms it.',
  '',
  '  Name a source in the prose ONLY when the naming carries information: the claim',
  '  is contested, who says it IS the story, or two sources disagree. Once per piece',
  '  the source gets named properly — usually early, so the reader knows whose',
  '  reading this is. After that, the marks do the work.',
  '',
  '- A guided reading, NOT a summary and NOT a transcript. A summary collapses; this',
  '  EXPANDS: where the source moves fast past something a careful reader needs, the',
  '  piece slows down and explains. It never argues with the source; it frames it.',
  '- Magazine-essay register: The New Yorker, Harper\'s, long-form Atlantic. Calm,',
  '  knowing, slightly amused where appropriate, never breathless. Sentences earn',
  '  their length. But essays are also STORIES: every section must end giving the',
  '  reader a reason to start the next. Never end a section by summarizing it.',
  '- Lead with people, not concepts. "Isabel Castaneda failed Spanish — her native',
  '  language — because an algorithm said so" beats "This illustrates the problems',
  '  of algorithmic decision-making." Reach abstraction only after the concrete case lands.',
  '- If the source is partisan or has a strong ideological frame, the FIRST section',
  '  introduces who they are (a context box works well) — once, properly, so the',
  '  reader knows whose reading this is. That is what replaces repeating "in X\'s',
  '  view" every third sentence: their frame is declared, and from there the marks',
  '  say what rests on them alone.',
  '- The lede is 100-180 words, drops the reader straight into the substance (no "in',
  '  this piece" framing), and makes a specific, contestable claim. A reader who',
  '  stops there must still have learned something.',
  '- The headline wraps EXACTLY ONE phrase in <em> — the word doing the most work.',
  '  It lifts something concrete from the source; "What X says about Y" is too generic.',
  '- The dek is one sentence, 25-40 words, and it states WHAT IS GOING ON — never',
  '  "[speaker] argues that…". «Raymundo Riva Palacio argues that López Obrador left',
  '  Palenque…» is wrong; «López Obrador left Palenque for the capital because the',
  '  American investigations reached his son» is right. Same for its <em> variant,',
  '  which italicizes one word.',
  '- Sections: source-driven count, 2 to 7 (default 5). Never pad, never compress.',
  '  Each has a two-digit number, a title with one <em> phrase, a one-or-two sentence',
  '  standfirst, and paragraphs that BUILD. Dense material → paragraphs of at most',
  '  4 sentences.',
  '- Context boxes explain what the source assumes: an institution, a treaty, a term.',
  '  The label names the thing ("What is the JCPOA?"). The box is neutral background,',
  '  3-6 sentences, no opinion.',
  '- Quote blocks carry the source\'s own words, lightly cleaned (no "uh", no false',
  '  starts), meaning preserved exactly. Use 1-3 per piece at the moments where the',
  '  speaker\'s voice does what paraphrase cannot.',
  '- At most one pull quote in the whole piece, and only if one line truly deserves it.',
  '- HOW THE SENTENCES GO, and this is measured. A piece published this month',
  '  carried a 76-word sentence: two facts, a quotation and a verdict in one',
  '  breath. A sentence like that is not read, it is decoded.',
  '    · No sentence over 35 words. Break it; nothing is lost but the semicolon.',
  '    · Average 18 to 24 words. Essays may breathe longer than news, not endlessly.',
  '    · Never stack two subordinate clauses joined by "while" or "and meanwhile".',
  '- EXPLAIN THE SPECIALIST TERM. The first time a piece uses a word a careful',
  '  general reader would not carry — a financial instrument, a legal standard, a',
  "  weapons system, an institution's acronym — explain it in plain words: a short",
  '  clause in the prose, or a context box when it needs three sentences. This is',
  '  the whole point of an annotated reading: the source assumed it, and you do not.',
].join('\n');

/**
 * La pieza en inglés, como contrato JSON.
 *
 * @param digest    lo que dijo la fuente (promptDigestPieza)
 * @param reportes  documentos de fuera ya digeridos (promptReporte), puede ir vacío
 * @param piezas    la colección existente [{issue, slug, title}] para callbacks
 * @param issueNo   el número que le toca, p. ej. «N° 43»
 */
export function promptPieza(digest, reportes, piezas, issueNo) {
  return [
    'You write for a small bilingual publication of annotated readings. Each piece',
    'takes ONE source — an interview, a lecture, an article — and turns it into a',
    'guided reading a careful generalist can trust.',
    '',
    VOZ,
    '',
    `THIS PIECE IS ${issueNo}.`,
    '',
    'THE SOURCE, digested:',
    JSON.stringify(digest),
    '',
    reportes.length
      ? 'OUTSIDE DOCUMENTS fetched to check the source\'s claims — use them to ground,\n' +
        'confirm or push back in the prose ("Reuters reported…", "the filing shows…").\n' +
        'Where an outside record CONTRADICTS the source, that tension goes IN the piece,\n' +
        'stated plainly, not resolved by silence:\n' + JSON.stringify(reportes)
      : '(no outside documents were fetched; write from the source alone and mark its',
    reportes.length ? '' : 'unsupported claims as claims — "X asserts", "by X\'s count")',
    '',
    'THE SLUGS ALREADY TAKEN (so the new one does not collide). Do NOT link to any',
    'of these from the piece: each piece stands on its own.',
    JSON.stringify(piezas.slice(0, 60)),
    '',
    'Return ONLY a JSON object, no markdown fences:',
    '{',
    '  "slug": "speaker-or-topic-kebab-case, 3-5 words, unique vs the collection above",',
    '  "track": "general|thesis|ai-policy|finance|geopolitics",',
    '  "title": "plain text headline — it is what people see when the link is shared, so it has to earn the click without overselling: the surprise, not the topic. No colon-and-subtitle, no question mark",',
    '  "titleHTML": "same headline with exactly one <em>…</em> phrase",',
    '  "dek": "one sentence, 25-40 words, plain",',
    '  "dekHTML": "same with one <em> word",',
    '  "coverDek": "2-3 sentences for the cover: what is going on and why it matters. State it — no «the columnist X says», no «this piece separates what is documented from what is not». The marks do that inside.",',
    '  "source": "Based on … · outlet/show — how the piece should credit its source",',
    '  "topics": ["3-6 topical tags, Title Case"],',
    '  "lede": "the opening paragraph, 100-180 words, plain prose",',
    '  "sections": [',
    '    {"number":"01", "title":"plain", "titleHTML":"with one <em>", "standfirst":"1-2 sentences",',
    '     "blocks":[',
    '       {"type":"p","md":"a paragraph; markdown emphasis allowed"},',
    '       {"type":"context","label":"What is …?","md":"3-6 neutral sentences"},',
    '       {"type":"qa","speaker":"surname","md":"the source\'s own words, cleaned"},',
    '       {"type":"pullquote","md":"one line, only once in the whole piece"}',
    '     ]}',
    '  ]',
    '}',
    '',
    'Hard rules:',
    '- 2 to 7 sections; each section has at least 2 blocks and at most 8.',
    '- Follow the source\'s own moves (the digest\'s `outline`), not a template.',
    '- Quote blocks only with words that are in the digest\'s quotes or clearly implied',
    '  verbatim content; NEVER invent a quotation.',
    '- Facts you did not get from the source or the outside documents do not exist.',
    '- No em-dash festival, no "delve", no closing paragraph that summarizes the piece.',
    '- The last section ends on what remains open or what to watch, not on a recap.',
  ].filter(Boolean).join('\n');
}

/**
 * La versión española: artículo paralelo, no traducción palabra a palabra.
 * Registro peninsular — es la convención de la colección de piezas
 * (`references/spanish-translation.md`), a diferencia del semanal, que decidió
 * es-MX en D-020. Se imita la colección, no el semanal.
 */
export function promptPiezaES(piezaEN, glosas = []) {
  return [
    'Translate this annotated-reading piece into Spanish as a PARALLEL ARTICLE —',
    'same structure, same components, same editorial voice — in the register of',
    'Letras Libres / Nexos / Gatopardo: Mexican Spanish, editorial, alive.',
    '',
    'THE PIECE (JSON):',
    JSON.stringify(piezaEN),
    '',
    // Las glosas del pie de fuentes viajan con la pieza porque son parte de lo
    // que lee el lector, no metadatos: sin ellas, la edición española acababa
    // enseñando la glosa inglesa y la inglesa no enseñaba ninguna.
    glosas.length ? 'THE SOURCE GLOSSES (what each source supports), same order:' : '',
    glosas.length ? JSON.stringify(glosas) : '',
    '',
    'Return ONLY a JSON object with EXACTLY the same shape and the same keys' +
      (glosas.length ? ', PLUS a "sources_gloss" array with those glosses in Spanish, same order and same length.' : '.'),
    'Translate: title, titleHTML, dek, dekHTML, coverDek, source, topics, lede,',
    'and every section title/titleHTML/standfirst/blocks.',
    'Keep IDENTICAL: slug, track, section numbers, block types and speaker names.',
    'TRANSLATE EVERYTHING THE READER SEES, and that includes the `label` of every',
    'context box: it is the title of the box, not a machine field. «What is Pemex?»',
    'becomes «¿Qué es Pemex?». And do NOT then repeat that question as the first',
    'words inside the box — the label already asks it; the box answers.',
    'Keep the <span class="doc">, <span class="attr"> and <span class="said"> marks',
    'exactly where they are, wrapping the SAME claim: they are the apparatus, not',
    'formatting. Spanish reorders sentences — move the mark with its claim.',
    '',
    'Register rules (they are what makes it read native):',
    '- YOU ARE THE SAME EDITOR, WRITING THIS PIECE AGAIN IN SPANISH. Not a',
    '  translator working under someone else. Recast the sentence, change the',
    '  image, reorder the paragraph, gloss what a Mexican reader needs and drop the',
    '  gloss they do not. Total freedom in FORM.',
    '  None in FACT: the same claims, the same marks on the same claims, not one',
    '  quotation more, no figure changed. Freedom of form is what makes it read as',
    '  written in Spanish; freedom of fact would make it a different piece.',
    '- This is an INTERPRETATION, not a translation. Spanish syntax is not English',
    '  syntax with Spanish words: reorder, split, join, change the verb, drop the',
    '  possessive English needs and Spanish does not. The test is whether a reader',
    '  in Spanish would guess it was written in Spanish. If a sentence only works',
    '  because you kept the English shape, it is wrong even if every word is right.',
    '- Spanish runs 15-20% longer than English, so the cap travels: no sentence',
    '  over 40 words. Where English broke a sentence in two, Spanish may need three.',
    '- Mexico, editorial: «computadora», «celular»; pretérito perfecto compuesto for',
    '  events still touching the present («ha dicho»), indefinido for closed ones.',
    '- «Angular quotes» for quotations inside prose; translate quoted speech into',
    '  Spanish (readers know the convention means "this is what was said", not',
    '  "these were the exact syllables").',
    '- LAS CIFRAS GRANDES LLEVAN SU EQUIVALENTE INGLÉS ENTRE PARÉNTESIS la primera',
    '  vez que aparecen. «billion» y «billón» son falsos amigos y la escala cambia',
    '  de idioma, así que el lector que oyó la cifra en inglés tiene que poder',
    '  reconocerla:',
    '      $130 billion  → 130 mil millones de dólares (130 billion)',
    '      $5 trillion   → 5 billones de dólares (5 trillion)',
    '      900 million   → 900 millones (sin paréntesis: aquí las dos escalas coinciden)',
    '  Solo la PRIMERA vez de cada cifra, y solo cuando la palabra de escala cambia',
    '  —millones no lo necesita—. Repetirlo en cada mención convierte la prosa en',
    '  una tabla de conversión.',
    '- No bureaucratic calques: «aplicar», never «implementar»; «quienes deciden»,',
    '  never «decisores»; «padres», never «progenitores».',
    '- AND NO CALQUES OF IMAGE OR IDIOM, which is where this actually fails. The',
    '  published piece said «Es el movimiento inicial de la columna, y es el',
    '  movimiento de un padre antes que el de un político» — every word correct,',
    '  the sentence unreadable, because «move» was carried across as «movimiento».',
    '  It should have been «Es el punto de partida de la columna, pero antes que un',
    '  cálculo político, es un gesto de padre.» Same meaning, Spanish shape.',
    '  Watch these in particular — they are the ones that slip through:',
    '    move → jugada / gesto / paso (never «movimiento» for a decision)',
    '    claim → afirmación, señalamiento (never «reclamo»)',
    '    account → relato, versión (never «cuenta»)',
    '    record → expediente, antecedentes, lo documentado (never «récord»)',
    '    the piece / the case for → la pieza, el argumento a favor de',
    '    to address → atender, abordar (never «direccionar»)',
    '    evidence → pruebas, indicios (never «evidencia» when it means proof)',
    '- BEFORE RETURNING, reread your Spanish once with one question: does any',
    '  sentence reveal that it was written in English first? If one does, rewrite',
    '  that sentence from its meaning, not from its words. This pass is not',
    '  optional; it is the difference between a translation and an edition.',
    '- Technical vocabulary yes, BOE register no. Sentences stay alive.',
    '- titleHTML and dekHTML keep exactly one <em> phrase each, on the Spanish word',
    '  that now does the most work (it may not be the literal translation of the',
    '  English one).',
  ].join('\n');
}
