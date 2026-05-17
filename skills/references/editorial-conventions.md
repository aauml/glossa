# Editorial conventions

The voice is the thing most likely to drift. Read this every time before writing.

## What Lecturas is not

- Not a transcript. Lecturas pieces are guided readings, not raw conversations. Quotes are cleaned up — "uh," repetitions, false starts, and the host's filler are removed. Meaning is preserved exactly.
- Not a summary. A summary collapses; Lecturas expands. Where the source moves quickly past something a careful reader would want context for, a Lecturas piece slows down and explains.
- Not neutral wire copy. The piece has a point of view about *what's worth attending to* in the source. That's what the section headings, exhibits, and pull-quote select for.
- Not a hot take. Lecturas doesn't argue with the source. It frames it for slow reading.
- Not a textbook. The piece should move, not lecture. If a paragraph feels like it belongs in a syllabus, rewrite it as narrative.

## Tone

The model is a magazine essay — *The New Yorker*, *Harper's*, *Granta*, *El País Semanal*, the long-form *Atlantic* — not a blog post and not an op-ed. Sentences earn their length. Paragraphs build. The voice is calm, knowing, slightly amused where appropriate, never breathless.

**But magazine essays are also stories.** The best long-form reads in the world are propulsive — they give you a reason to keep reading at the end of every section. The worst academic summaries give you no reason to keep reading after the first paragraph. Lecturas should feel closer to the former.

Three principles for fluidity:

1. **Lead with people, not concepts.** "Isabel Castaneda failed Spanish — her native language — because an algorithm said so" is better than "The IBO controversy illustrates the problems of algorithmic decision-making." Start sections with specific situations when the source provides them; reach for abstraction only after the concrete case has landed.

2. **Transitions pull forward, not backward.** Don't end sections by summarizing what was just said. End them by opening a question that the next section will answer, or by landing a beat that makes the reader want to know what happens next. The reader should feel continuity, not chapter breaks.

3. **Shorter paragraphs for dense material.** A paragraph in a geopolitics piece can run six or seven sentences because the material is narrative. A paragraph in an ai-policy or thesis piece should rarely exceed four sentences. Dense content needs white space. Let the reader breathe.

The opening paragraph (`p.lede`) is doing the most work in the piece. It should:
- Drop the reader directly into the substance — no "in this article" framing
- Make a specific, contestable claim (not a vague preview)
- Be concrete enough that a reader who only got that far still learned something
- Run 100-180 words

The drop cap is automatic via CSS. Don't make the lede too short or it looks lonely.

## Headline craft

Every Lecturas headline has exactly one phrase wrapped in `<em>` tags. The italic word should be the one that does the most work — usually a verb, sometimes a noun that names the central object. Examples from existing issues:

- N° 01: "The cycle Ray Dalio says America is *inside*"
- N° 02: "The toll booth, the triangle, and the *summit*"

The italicized phrase is the anchor — the word the headline is really about. Pick it deliberately.

Headlines should be specific to the source. "What X says about Y" is the basic pattern but too generic; lift one concrete thing from the source and lead with it.

## Dek (the italic subhead under the headline)

One sentence. 25-40 words. Sets up what the piece is doing. Italic by CSS, no further markup needed.

Pattern: `[Source/speaker] [verb] [the thing they're claiming or showing]. [Optional second clause that names what the reader will get.]`

Example: "Pepe Escobar, in conversation with Judge Andrew Napolitano, describes a war that ended without ending — and an alignment that has decided who runs the strait of Hormuz now."

## Section structure

**Section count is source-driven.** The default is five, but the range is two to seven. A short article with one argument might need three. A 90-page law review article might need six or seven. A podcast that elaborates a single thread might need two. Don't pad to hit five; don't compress to avoid six.

**Multi-part pieces.** For very long or very dense sources — a book chapter, a 90-page law review article, a three-hour testimony — a single piece may not be enough. In those cases, split into multiple pieces (Part I, Part II), each self-contained, each with its own slug (`topic-part-1`, `topic-part-2`). Each part should work on its own: a reader who only reads Part I should learn something complete. This is a last resort — most sources, even long ones, compress into one piece. Use multi-part only when one piece would exceed ~5,000 words and the compression would sacrifice the things that make it worth reading.

Each section has the same internal anatomy:

```
.section-number            "§ 01 — [name]" — short, oxblood
h2.section-title           Title with one <em> phrase, like the main headline
.section-standfirst        Italic, sets up what the section will do
[body paragraphs, exhibits, qa-blocks, context-boxes as needed]
```

Section titles follow the same one-italic-phrase pattern as the main headline.

The standfirst is essentially the section's own dek — it tells the reader what they're about to get. One sentence usually, two if needed.

## When to use each component

**Use a `context-box`** when a reference in the source assumes background most readers don't have. Examples: explaining what the JCPOA was, who Primakov was, what the Brussels Effect means, what a Suez moment refers to, what DMCA notice-and-takedown is, how Mathews v. Eldridge works. Two paragraphs maximum. The label is "Background — [question]" or "What is X?"

The context-box is doing what scholars call **glossing** — providing a brief explanation of an unfamiliar term, person, or reference that the source assumed the reader would already know. This is one of the most-loved features of Lecturas. Don't be stingy with context-boxes when the source genuinely demands them; a careful reader appreciates being given the background instead of having to look it up. But also don't gloss what doesn't need glossing — if the source explains something itself, don't repeat the explanation in a box.

**Context-box density depends on the source type:**
- **Conversational sources** (podcasts, interviews): 2–4 context boxes. The speaker usually explains their own references; you gloss what they skip.
- **Journalistic sources** (news articles, magazine pieces): 3–5. The journalist explains some things; you fill in what they assumed.
- **Academic/legal sources** (law review articles, policy papers, doctoral work): 5–8. Academic writing assumes a specialist reader. A Lecturas reader is smart but not necessarily a specialist. Gloss every concept the source treats as given that a non-specialist would need to look up. This is where context-boxes earn their keep.

Pattern: ask yourself, "If a smart but non-specialist reader hit this passage cold, what one piece of background would unlock it?" That question is the context-box.

**Use a `qa-block`** when the conversational rhythm itself matters — the back-and-forth, the question that triggered the answer. Don't qa-block everything; the article isn't a transcript. Use it for the moments where the exchange is part of the meaning. Edit ruthlessly for clarity.

**Use an `inline-note`** for tangents that interrupt the main argument briefly — clarifications, technical specs, "the X referenced above is Y" callouts. Sans-serif, smaller, top + bottom rule. One per article maximum, ideally zero.

**Use the `pull-quote`** exactly once per article. It's the line the source itself elevates — usually a direct, vivid statement that lands in three seconds. Don't pull-quote a long passage; if it doesn't fit on three screen lines, it's not a pull-quote, it's a block quote, and Lecturas doesn't use those.

**Use a `callback`** when the new piece picks up themes from an earlier issue. It goes immediately after the lede paragraphs (before the first section divider). Format: `<strong>Continues themes from N° XX</strong> · [one sentence on what's continuing]`.

## Partisan and contested sources

Some sources have a clear ideological frame. Pepe Escobar is openly committed to a multipolar/anti-imperial reading of the world. Other voices may be openly committed to other readings. Lecturas doesn't sanitize these voices — sanitizing them would lose the thing the reader came to read.

The way to handle a partisan source is **not** to launder the voice. It's to introduce the voice up front, in the lede or in an early paragraph, so the reader knows what they're reading. Two patterns work:

1. **Inline characterization** in the lede paragraphs. "Escobar is a particular voice. Brazilian by birth, journalist by trade, longtime correspondent for Asia Times and contributing editor at outlets across what he would call the multipolar world. He has spent the last fifteen years arguing — to use his own phrase — that wealth and power are pivoting east..."
2. **Context box on the speaker** when there's more to say than fits inline.

Once the framing is established, use "Escobar argues" / "in Escobar's view" / "in Escobar's account" throughout the body. Never just state contested claims as fact.

For colorful or aggressive language in the source ("toxic combination of stupidity and nastiness," "stupid Zionists"), preserve it as the speaker's words in qa-blocks or pull-quotes. Don't repeat the framing in your own editorial voice. After such a quote, a single editorial sentence acknowledging the rhetorical register without endorsing it goes a long way: "The line is harsh, and it is X's. It is also the kind of formulation that, on his own terms, only makes sense if you already share his diagnosis."

## Coda

Two or three short paragraphs at the end. No exhibits, no qa-blocks, no context boxes. The pattern that's worked:

1. **What's still uncertain** — the open questions
2. **What is not uncertain** — what the source has clearly established or what's already true
3. **What the reader is left with** — meta-reflection on how to use the piece

The coda is where Lecturas earns its "annotated reading" claim. It explicitly tells the reader what the piece was for.

## Cross-issue continuity

When two pieces touch the same theme, link them. The continuity doesn't have to be heavy — one mention, one callback, one analogy reused across pieces. N° 01 and N° 02 share:
- The strait of Hormuz (mentioned in both, mapped in N° 01, reframed as toll booth in N° 02)
- The Suez 1956 analogy (used by Dalio for British decline, by Escobar for American credibility)

When you spot this kind of resonance, surface it. The reader who has read both pieces should feel rewarded.

## Things to avoid

- **Sycophantic openings.** Never "What an interesting source!" or "This is a fascinating conversation." Just start.
- **Meta-commentary about the response itself.** Don't write "as we'll see in the next section" or "the following exhibit shows."
- **Hedging strings.** Not "perhaps it could be argued that, in some sense..." Make the claim or don't.
- **Em-dash overuse.** One per paragraph maximum is a good rule. They become a tic if let.
- **Bullet points in the body.** The body is prose. Lists belong in exhibits, not in the article.
- **AI-tells.** "It's worth noting," "in essence," "ultimately," "it's important to remember." Cut them.
- **Restated summaries.** Don't end sections by summarizing what you just said. End them by setting up what's next, or by letting the last paragraph land.
- **Scaffolding prose.** "The first reason is... The second reason is... The third reason is..." reads like a lecture outline. Weave arguments together. Use the source's own structure only if the source's structure is itself interesting.
- **Bureaucratic calques.** "Decisores" when "quienes deciden" works. "Progenitores" when "padres" is what you mean. "Implementar" when "aplicar" or "poner en marcha" say it better. This applies to both languages but especially to Spanish.

## Sentence syntax — keeping cognitive load down

Most Lecturas pieces are read on mobile, where the reader's working memory has less help from spatial layout than on paper. Two habits keep the prose readable on a small screen without flattening the register.

**Limit subordination depth.** No sentence should hang more than two levels of subordination off the same head noun. If you find a relative clause inside a relative clause inside a parenthetical inside the main clause, split. The reader is forced to hold the head noun active across the whole nested structure, and on a phone the head noun has usually scrolled off the top of the viewport by the time the verb arrives. Concrete test: read the sentence aloud at normal speed. If you lose track of what the subject is before the verb arrives, the structure is too deep.

**Vary rhythm.** Aim for at least one short sentence (under 15 words) for every two long ones (over 30 words). The short ones are not padding — they are the decompression that lets the long ones land. Magazine prose alternates deliberately; academic prose tends not to, which is one of the reasons academic prose tires the reader faster.

**Split `Primero / Segundo` patterns into their own paragraphs** when each carries argumentative weight. Inline `Primero, X. Segundo, Y.` reads as a list disguised as prose. Two short paragraphs — "La primera es que X." / "La segunda es que Y." — give the reader the visual cue that two distinct beats are coming, and let each one absorb.

**Split compound sentences with both a colon and a coordinating conjunction.** A sentence shaped like *"Primero, X reclama Y: Z, y W."* is doing too much: a thesis, an explanation, and an extension joined into one. Three separate sentences almost always read better.

## Inline glossing for technical terms

A second source of cognitive load, distinct from sentence syntax, is technical vocabulary the reader has to stop and recall. A six-word gloss on first appearance is not padding — it is the most compressed possible form of needed information.

**Gloss on first appearance**, then never again in the same piece:

- *Latin legal terms:* ex ante, ex post, prima facie, mutatis mutandis, stare decisis, ratio decidendi, obiter dicta.
- *Specialized acronyms:* first use as full name + acronym in apposition. After that, use the acronym alone. Examples: "el Marco de Gestión de Riesgos de IA del NIST (AI RMF)", "legalidad por diseño (LbD, por sus siglas en inglés)", "evaluación de impacto en protección de datos (EIPD)".
- *Untranslated technical terms:* smart contract, oracle (in the crypto sense), Brussels Effect, *ethics-shopping / ethics-washing*. Keep the original term where translating it would lose precision; gloss it in six words.
- *Field neologisms:* onlife, sociotechnical, infrastructural power.
- *Legal principles a non-lawyer reader may not know cold:* the principle of legality, the rule of law (when used in a technically specific sense), administrative due process.

**Do not gloss** vocabulary the academic-magazine register presupposes: jurisprudencia, normatividad, debido proceso, derechos fundamentales, democracia constitucional, imperio de la ley, judicatura independiente, separación de poderes. Glossing these is condescending and signals the piece is aimed at the wrong reader.

**Format.** Em-dash interpolation by default — readable inline, doesn't slow flow:

> *La decisión ocurre ex ante — antes de que el sistema actúe — en el momento de redactar las cláusulas.*

Parentheses are fine when the gloss is one or two words; avoid "es decir" (adds two words and reads textbook-y).

**Exhibits must be readable standalone.** If an exhibit (`<Comparison>`, `<Scorecard>`, `<Bars>`, etc.) uses an acronym or technical term that hasn't been glossed earlier in the body, gloss it inside the exhibit's content or label. The reader of an exhibit should not have to scroll back to the body to decode it.

## Pedagogical hinges — selective scaffolding for organizing concepts

Most Lecturas paragraphs do not need pedagogical scaffolding. The genre is academic-magazine, not seminar notes. But every piece has one or two passages where a single distinction or concept organizes everything that comes after — *if the reader misses it there, the rest of the piece does less work*. Those are hinge passages, and they justify expanded pedagogical treatment even at the cost of length.

**How to spot a hinge.** A passage is a hinge when one or more of the following holds:

- It is the first appearance of a concept the piece will reference five or more times.
- It introduces a distinction (A vs. B) that organizes a later section, an exhibit, or the coda.
- It marks a counterintuitive move where the reader's first instinct is likely wrong (e.g., "two things that look identical do opposite work").
- It carries a definition the rest of the argument depends on.

A piece has as many hinges as the source has organizing concepts that the rest of the argument depends on. A narrative interview may have one — the single tesis the reporter is reconstructing. A dense paper or book chapter may have five — one per structural move. A summary piece that's not really arguing may have zero, in which case the genre is wrong and a Lecturas piece probably shouldn't exist. Don't pick a number in advance; pick the passages and count them after.

**The hinge pattern.** When you've identified a hinge, expand it using this five-move structure:

1. **Concrete anchor first.** Open with an example, image, or scenario the reader can hold in working memory. Not the abstract claim. "Imagina un sistema que decide automáticamente si una persona recibe una prestación social…"
2. **Name the concept after the anchor**, not before. The reader already has something to attach the name to.
3. **Unpack any technical sub-terms with inline glosses** as you introduce them (see *Inline glossing* above).
4. **Recast abstract opposition as two concrete questions** when contrasting concepts. Not "they do opposite work" but "A asks: how do I make the system comply with the rule? B asks: how do I make the system leave standing what makes the rule protect?"
5. **Close with a reflection prompt**, not a summary. A question the reader can hold without answering — one that the rest of the piece will retroactively answer. *"Antes de continuar, considera: ¿…? La intuición rápida puede no ser correcta."*

**Cost and discipline.** A hinge expansion adds roughly 200-300 words to what would have been a 80-150 word paragraph. That cost is acceptable on the passages that genuinely warrant it. It is not acceptable on every paragraph — a piece where every concept is scaffolded becomes a textbook chapter and loses the magazine register entirely.

**Where not to use hinges.** Don't scaffold concepts that have already been installed earlier in the piece. Don't scaffold the recap moves of a coda. Don't scaffold in places where the source itself already does the pedagogical work and your job is to compress, not expand.

**Trigger.** Apply hinge treatment when the piece itself warrants it — usually automatically, on the passages that meet the spotting criteria above. If Arturo asks for a piece that is "más accesible," "para seminario," or names a less expert reader, increase the number of hinges. If he asks for "registro estricto academic-magazine," reduce to zero hinges and let the regular prose do the work.

## Semantic load — what the syntax rules don't catch

The sentence-syntax rules above measure parsing difficulty per sentence. They miss a separate source of heaviness that operates at the paragraph and section level: **semantic load**, the amount of conceptual material the reader has to keep active to follow the argument. A piece can pass every syntax test and still feel heavy because the reader is processing too many abstract entities, too many institutional references, too few physical anchors, or too much information per unit of visible scroll.

Four operative rules:

**Abstract-noun density.** A paragraph that contains four or more abstract nouns (*implicación, sustitución, plantilla, infraestructura, posición, condiciones, hechos estructurales, desplazamiento, arquitectura, categoría, dimensión*) without at least one concrete noun — a person, a place, an object, a number, a scene — is too dense. The reader has to reify each abstraction mentally without anything physical to anchor it. Add a concrete noun, or compress.

**Concrete anchor per section.** Every section should contain at least one physical anchor. Wolff talking, Wolff arguing, Wolff diagnosing — those are all the same abstract register. Wolff at Yale in 1968 reading his classmates' development-economics assignments — that is a scene. Trump asking on Truth Social for a ballroom "as large as" the Great Hall of the People — that is a scene. The Gulf Cooperation Council declining to host Netanyahu's coalition — that is a scene. The piece needs scenes, not just arguments.

**Concrete-fact placement.** When a paragraph contains a falsifiable empirical claim — a number, a date, a quoted statement, a named event — it should appear by sentence two of the paragraph, not at the end. Burying the concrete inside the abstract forces the reader to process abstract claims without the fact that would have grounded them. Surface the fact early; let the abstract reasoning land on top of it.

**Body paragraph length cap (~100 words).** Even with perfect sentence structure, a paragraph above 100 words feels *macizo* on a phone screen — a wall of text with no visual respiration. Split paragraphs visually if not analytically. A 200-word paragraph that splits naturally at a thematic seam should be two paragraphs. The decision is perceptual, not editorial: the eye needs the white space.

**Institutional reference budget.** Maximum three named institutions / think tanks / outlets / agencies per section in the body. Additional sources go to footnotes. The body should not feel like a citation list. The reader who wants the source goes to the footnote; the reader who wants the argument doesn't have to carry twenty-two organizational names. This rule is the most counterintuitive of the four — academic instincts say "more citations is more rigorous." For the magazine register, the opposite is true: more citations in body is more noise per paragraph. Move the citations, keep the rigor.

**Why this matters more than it looks.** The original cognitive-load rules were a real improvement on the previous register. But they measured only what is easy to measure programmatically. The lived experience of "still heavy after passing the checks" reveals that the harder rules to enforce — semantic density, concrete anchoring, paragraph breath — are exactly the rules that distinguish prose that *passes the audit* from prose that *reads light*. The skill must enforce both layers.

## Length targets

Length is not a fixed range — it is a tiered framework. A piece falls into one of four tiers, each with its own discipline. Thresholds trigger different actions, not different verdicts.

**Short piece (1,500–3,500 words, 8–15 min read).** The default. Focal sources: an article, an interview, an op-ed, a podcast episode, a talk. One or two pedagogical hinges. Most Lecturas pieces should aim here.

**Medium piece (3,500–6,000 words, 15–25 min).** For substantial sources: an academic paper, a long magazine article, a book chapter, an extended report. Two to four hinges. Navigation aids (TOC, per-section reading times) become useful.

**Long piece (6,000–10,000 words, 25–40 min).** For foundational sources: a full book, a sweeping policy document, multi-hour testimony. Three or more hinges. Navigation aids essential. The piece must earn its length with structural ambition; otherwise, compress or split.

**Very long piece (>10,000 words).** Rare. Each section must justify itself. Default presumption is that the piece should be a series, not a single piece — unless the structural criteria (argumental unity, single research apparatus, Index test failing for hypothetical Part II) clearly say otherwise.

**Thresholds are signals, not limits.** Crossing 6,500 words does not require splitting; it requires asking whether the structure supports the length. If the answer is yes, the piece stays long. If the answer is no, two corrections are available: compress if the piece is overwritten, split if it bundled independent threads. Length itself is never a sufficient criterion for splitting — the structural criteria (independent threads, distinct research apparatus, Index test positive) decide.

Sub-targets, still useful at any tier:

- Lede: 100–180 words
- Section standfirst: 25–50 words
- Section body (excluding exhibits): 200–600 words — shorter for dense material, longer for narrative
- Coda: 150–300 words

These are guides, not rules. Don't pad to hit the target; don't truncate beats that need their space. A short piece that's alive is better than a long piece that's thorough but dead.
