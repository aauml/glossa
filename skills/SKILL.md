---
name: glossa
description: Glossa is the publication layer over the phd-kb knowledge base — it turns a seed (an idea, source, or question) into a bilingual (English + Spanish) annotated reading with verifiable provenance, published to Arturo's collection at glossa.ademas.ai (repo aauml/glossa). Use this skill whenever Arturo provides source material (transcript, URL, video, paste) AND asks for an annotated reading, OR when he names a topic/question and asks for an explainer or "reading on" something. Also use when he refers to existing pieces, asks to update the collection, or extends/edits a piece already in it. The skill encodes the editorial voice, design system, bilingual translation conventions, the Astro-based deployment pipeline, and Glossa's data model (glossa_* tables in phd-kb): it reads the curated KB (evaluated_items), records human authorship and provenance, and respects the human supervision gates (compuertas).
---

# Glossa

Glossa is the **publication layer (domain PUB)** over the `phd-kb` knowledge base. It produces pieces in Arturo's bilingual annotated-reading collection, anchored to a dated human seed and backed by verifiable provenance. The thinking is Arturo's; research, verification, drafting, and publishing are assisted.

> **Heritage.** Glossa evolves the `lecturas` skill and its live site (`glossa.ademas.ai`, repo renamed `aauml/lecturas` → `aauml/glossa`). The public publication brand is still "Lecturas" on the live site until the brand migration ships (docs 08/09); the skill, repo, and data domain are already "Glossa." The editorial machinery below is unchanged from `lecturas` — what is new is the phd-kb integration and the compuertas.

## ⚠️ Style precedence — read this first

The editorial rules in `references/editorial-conventions.md` take precedence over the style of any existing piece in `src/content/articles/*`. **The archive is deployed history, not style canon.** Do not pattern-match to existing pieces as templates for new ones — most of them predate the current editorial conventions (cognitive-load limits, inline glossing, pedagogical hinges, tiered length framework).

If you need to look at examples of the current register, use only these:

- `N° 17` (hildebrandt-law-computer-scientists, both EN and ES) — full canon, all rules applied
- `N° 20` (wolff-third-option, ES) — partial canon, gloss pattern correct
- `N° 18` (wilkerson-beijing-choreography, ES) — partial canon, reflection prompts present

All other pieces (N° 01 through N° 16, both N° 19s) precede the current conventions. They are valid history but invalid templates.

## 🔍 Pre-publish checklist — run before every push

Before pushing a new piece (or a rewrite), measure these against the rules and report the numbers in the reply. If any fail, fix before pushing — not after.

**Sentence-level rules:**

1. **Length tier identified.** Short (1.5-3.5K) / Medium (3.5-6K) / Long (6-10K) / Very long (>10K). State which tier, and confirm the tier's discipline is satisfied (hinge count, navigation aids if needed, structural ambition if long).
2. **Short:long sentence ratio ≥ 2:1.** Measure with the audit pattern below. If below 2:1, split long sentences before pushing.
3. **No sentence with >2 levels of subordination.** Read each long sentence and trace the subordination tree. If a relative clause hangs off a relative clause hangs off a parenthetical, split. **This rule applies regardless of sentence length** — a 17-word sentence with three subordinations is heavier than a 30-word sentence with linear structure. Hidden subordination is more dangerous than long length because the metric doesn't catch it.
4. **Distance between subject and main verb ≤ 12 words.** If the reader has to hold the head subject in working memory across a long relative clause before reaching the verb, the sentence taxes parsing. Move the subordinate clause out front, or split.

**Lexical / glossing rules:**

5. **Inline glosses present on first appearance of:** Latin terms (ex ante, ex post, prima facie); specialized acronyms (LbD, RGPD, AI RMF, etc.); untranslated technical terms (smart contract, oráculo, Brussels Effect); field neologisms (onlife). Em-dash format, ≤7 words, never repeated.

**Semantic-density rules (lived-experience load):**

6. **Abstract-noun density.** Each paragraph that contains four or more abstract nouns (*implicación, sustitución, plantilla, infraestructura, posición, condiciones, hechos estructurales, desplazamiento*, etc.) without at least one concrete noun (a person, place, object, number, scene) is too dense. Add a concrete anchor or compress.
7. **Concrete anchor per section.** Each section should contain at least one physical anchor: a named scene, a verifiable number, a specific moment, a quoted phrase, an object. Wolff talking, Wolff arguing, Wolff diagnosing — those are all the same abstract register. Wolff at Yale in 1968 reading his classmates' assignments — that is a scene. The piece needs scenes, not just arguments.
8. **Concrete-fact placement.** When a paragraph contains a falsifiable empirical claim (a number, a date, a quoted statement), it should appear by sentence 2 of the paragraph, not at the end. Burying the concrete inside the abstract makes the abstract harder to process. The concrete grounds it.
9. **Body paragraph length ≤ 100 words** (excluding components like ContextBox, Scorecard, Timeline). A paragraph above 100 words feels macizo on mobile even with perfect sentence structure. Split visually if not analytically.
10. **Institutional reference budget.** Maximum three named institutions / think tanks / outlets per section in the body. Additional sources go to footnotes. The body should not feel like a citation list.

**Structural rules:**

11. **Pedagogical hinges identified and developed** with the five-move pattern (concrete anchor → name → sub-term glosses → opposition as two questions → reflection prompt). Count must match what the source warrants — not zero by default, not maximum by reflex.
12. **No `X: Y, y Z` compound sentences** doing thesis + colon + coordinated explanation.
13. **`Primero / Segundo` patterns** that carry argumentative weight live in their own paragraphs, not inline.
14. **Exhibits readable standalone** — any acronym or technical term in an exhibit must be glossed either there or earlier in the body.

The audit pattern for the measurable rules (run from `/tmp` after writing the MDX):

```python
import re
text = open('PATH_TO_MDX').read()
body = re.sub(r'^---\n.*?\n---\n', '', text, count=1, flags=re.DOTALL)
body_clean = re.sub(r'<(ContextBox|Scorecard|Timeline|PullQuote|Callback|Lede)[^>]*>.*?</\1>',
                    '', body, flags=re.DOTALL)
body_clean = re.sub(r'<[^>]+/?>', '', body_clean)
body_clean = re.sub(r'\{[^}]*\}', '', body_clean)

# Rule 2: short:long ratio
sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', body_clean) if len(s.strip().split()) > 2]
lens = [len(s.split()) for s in sents]
short = sum(1 for l in lens if l < 15)
long_ = sum(1 for l in lens if l > 30)
print(f"R2: short:long = {short}:{long_} ({short/max(long_,1):.2f}:1)")

# Rule 9: paragraph length
paras = [p.strip() for p in body_clean.split('\n\n') if len(p.strip()) > 50]
p_words = [len(p.split()) for p in paras]
heavy = sum(1 for w in p_words if w > 100)
print(f"R9: paragraphs >100w: {heavy}/{len(paras)}, max {max(p_words)}")

# Rule 6: abstract-noun density per paragraph (heuristic)
ABSTRACT = r'\b(implicación|sustitución|plantilla|infraestructura|posición|condiciones|hechos estructurales|desplazamiento|arquitectura|categoría|dimensión|operación|sustancia|principio|noción|función|relación|proceso|trayectoria|configuración|determinación)\b'
heavy_abs = [(i, len(re.findall(ABSTRACT, p, re.I))) for i, p in enumerate(paras)]
flagged = [(i, c) for i, c in heavy_abs if c >= 4]
print(f"R6: paragraphs with ≥4 abstract nouns: {len(flagged)}")
```

If any rule fails, the piece is not ready to push.

## What Glossa is

Glossa is a personal reader. Arturo curates podcasts, video interviews, articles, and topics he wants to understand more carefully than once, and they get rebuilt as guided readings — bilingual, with optional data exhibits, every claim verified, every assumed concept supplemented. Each piece can ship in English only or in English and Spanish.

The site is live at `https://glossa.ademas.ai` and is built with **Astro**. Articles are MDX content files; the design system (CSS, layouts, components) lives in code. Build merges the two. This means a new issue is two small MDX files, never a giant HTML file. Mobile publishing works because of this.

The format is validated through many issues. The voice and design are settled. Don't reinvent. Match it.

## Glossa and phd-kb — the publication layer

Glossa does not build a knowledge base, surveillance, memory, or cost tracking. Those already exist in `phd-kb` (Supabase project `wtwuvrtmadnlezkbesqp`, repo `aauml/thesis`). Glossa is domain **PUB**: it **consumes** the KB and **publishes**. Decision of record: **D-020** in `aauml/thesis/DECISIONS.md`.

**Boundary rule (do not cross).** PUB reads the KB, never modifies it. Glossa owns only the `glossa_*` tables and the `aauml/glossa` repo.
- ✅ Read `evaluated_items` (the curated bibliography) and its embeddings.
- ✅ Read `monitor_findings` (surveillance), `reading_conversations`, `source_validations`.
- ✅ Write `glossa_seeds`, `glossa_issues`, `glossa_issue_sources`.
- ❌ Never write `evaluated_items` or any `pm_*` / KB pipeline table. ❌ Never touch `agent_docs` (read-only mirror populated by `sync-docs.yml`).

**KB-first, then the web.** The curated corpus is the floor of trust; live web/APIs are the frontier. Always query the KB before reaching for Tavily/OpenAlex.

### Reading the KB (evaluated_items)

Two access paths — both via the Supabase project `wtwuvrtmadnlezkbesqp`. From **Code/Cowork** prefer the Supabase MCP `execute_sql`; from **chat/mobile** use the Supabase connector or REST. Keys via 1Password (`op`, vault `ademas.ai`); never paste them.

- **Cheap filters (no embedding) — default for a first pass:**
  ```sql
  select pk, title, url, source, importance, thesis_relevance, chapters, capa
  from evaluated_items
  where archived is not true
    and (thesis_relevance ilike '%PATTERN%' or title ilike '%recidivism%' or thesis_relevance ilike '%NIST%')
  order by (importance = 'ALTA') desc, created_at desc
  limit 25;
  ```
- **Semantic search (when a 384-dim query embedding is available):** RPC `search_evaluated_items(query_embedding, match_threshold, match_count, filter_importance)` — embeddings are `vector(384)`, generated by the KB's `generate-embeddings` edge function. Returns ranked cosine matches. Use for conceptual recall the keyword filters miss.

Capture the `pk` of every source you actually use — it is the provenance key written into `glossa_issue_sources`.

### Writing provenance (glossa_* — the pipeline)

Every piece leaves a provenance graph: a dated human **seed** → an **issue** moving through the pipeline → **sources** from the KB with verification. Schema: `db/migrations/0001_glossa_publication_layer.sql`.

1. **At the seed/framing gate** — insert one `glossa_seeds` row (the dated human intention = authorship). Set `mode` (tesis|fuente|pregunta|vigilancia|dialectica|serie), `track`, `thesis` (Arturo's angle), and any origin (`origin_finding_id` / `origin_conversation_id` / `origin_kb_id`).
2. **When work starts** — insert a `glossa_issues` row: `slug`, `issue_no`, `track`, `mode`, `status='researching'`, `seed_id`, and `title_en/title_es/dek_en/dek_es/topics/chapters` as they firm up. Advance `status` through `researching → drafting → review → published`.
3. **At the review gate / on publish** — for each KB source used, insert `glossa_issue_sources` (`issue_id`, `source_kb_id` = the `evaluated_items.pk`, `role` primary|support|context|discourse, `claim`, `verified` si|no|parcial). On publish, set the issue's `status='published'`, `url_en/url_es`, `published_at`, `model`.

Web/API sources that are not in the KB still go into the piece's `sources.json` sidecar (see `references/deployment.md` and doc 05); only KB-backed sources get a `glossa_issue_sources` row (it FKs to `evaluated_items`).

## Two intake modes

Decide automatically from the input shape, no confirmation question:

- **Mode A — annotate this source.** Arturo pastes a URL, transcript, video link, or source text. The piece is anchored to that source. Research wraps around it: verify every checkable claim, look up assumed concepts, supplement context.
- **Mode B — research this topic.** Arturo names a topic, question, or news event without a single source attached. The piece is anchored to understanding. Research IS the source-gathering: pull primary sources, expert commentary, opposing views, regulatory documents; synthesize.

Edge: a starting source plus "fuller picture" / "research more" / "what's the broader context" is **Mode B with that source as the entry point**. A bare URL with no instructions defaults to **Mode A**.

The skill executes one of these. Don't ask which.

## Entry modes and gates (compuertas)

The intake modes above (A/B) decide *how to research*. The **entry mode** decides *where Arturo's authorship enters* and *which human gates apply*. The invariant across all modes: a dated human intention anchors the piece, and there is a gate before anything is written or published. Detail: doc 03.

| Entry mode | What Arturo brings | Authorship enters | Framing gate? |
|---|---|---|---|
| **tesis** | a formed hypothesis | up front | no (thesis already set) |
| **serie** | a gap in the argument to fill | up front | no |
| **fuente** | a URL / PDF / podcast / video | after a digest | **yes** |
| **pregunta** | a question, no thesis yet | after a digest | **yes** |
| **vigilancia** | nothing — surveillance pinged | after a digest | **yes** |
| **dialectica** | two sources in tension | after a digest | **yes** |

**The two gates** — a gate is a stop where the flow waits for Arturo's OK. Nothing is written or published without it.

1. **Framing gate (encuadre) — "ask before fixing the thesis."** In material-first modes (fuente / pregunta / vigilancia / dialectica), stop after the research digest, surface what you found, and let Arturo react and fix the thesis/angle. Write the `glossa_seeds` row only once the thesis is fixed. In angle-first modes (tesis / serie) the thesis is already supplied, so this gate is already satisfied — proceed.
2. **Review gate (revisión) — "ask before publishing."** Build the EN/ES draft, then present it (and the source list) for Arturo's review and edits **before** pushing. Do not auto-push a Glossa piece. On approval, push, then write provenance and flip `status='published'`.

This is the one place Glossa deliberately departs from the old `lecturas` "ship first, talk later" default — see *When to ask vs when to proceed* below. The gate is elastic: during the conversation, pull more sources as needed; it is a ping-pong, not a rigid "before/after research" line. In angle-first modes the two gates can collapse into a single review conversation.

## Research is mandatory in both modes

Never just one source. Even in Mode A:
- Verify every checkable claim — figures, dates, attributions, named programs, treaties, quotes.
- Look up technical terms, organizations, historical references the source assumed.
- Pull primary sources for things the original speaker referenced second-hand.
- Cross-check partisan claims against non-aligned outlets. Don't reproduce a partisan figure as fact just because the source asserted it confidently.

In Mode B, this expands into multi-source synthesis: gather primary documents, expert commentary, contested points, glossary terms; produce a structured brief; build the piece from the brief.

In both, the output of the research phase is a small mental brief: key claims worth examining, primary sources worth quoting, contested points where sources disagree, glossary terms needing definition. The writing phase consumes that brief.

Tools available: web search (always-on Claude tool), Tavily MCP if connected, the `pdf` skill for primary documents, Claude's research mode if enabled. The skill picks based on what's available.

## Length and shape

**Length is source-driven, not formula-driven.**

- A short article that needs lots of context (e.g. AI governance) might produce a long reading — five times the source — because the context is the value.
- A long source that elaborates one argument (a 90-minute podcast on a single thread) might produce a short reading — the editorial work is compression.
- **Soft floor: ~800 words.** Below that it's a note, not a piece.
- **Soft ceiling: ~5,000 words.** Beyond that, consider splitting into multi-part.
- **Section count: 2–7, source-driven.** Default is five. A tight argument needs three. A 90-page law review article needs six or seven. Never pad to hit a number; never compress to avoid one.
- Exhibits earn their place. Zero exhibits is fine. Don't reach for one because the format expects it.

**Multi-part pieces.** For sources where one piece would compress out what makes them worth reading — a book chapter, a 90-page law review article, a regulation with sectoral chapters, an executive order touching unrelated domains — split into numbered parts (Part I, Part II) with separate slugs (`topic-part-1`, `topic-part-2`).

Split only when all three hold:
- **Independent threads.** A reader who lands on Part II doesn't need Part I to get something from it.
- **Distinct research apparatus.** Different primary sources, glossary, actors per part. If the research overlaps heavily, it's one piece.
- **Index test passes.** A reader arriving at Part II from the cover, cold, should find a coherent piece. If the conclusion depends on premises established in Part I, it's not a series — it's one long piece.

Keep one piece when the argument has internal dependencies — when cutting one section breaks another. Papers building a thesis step by step, long-form interviews developing one position, regulatory analysis where the conclusion depends on earlier definitions. Length alone is not a criterion: a 300-page book with one thesis is one piece; a 20-page paper with three independent contributions is three.

**Mechanics.** Ship one piece per trigger. Even when a series is warranted, produce Part I, surface the rest in the one-sentence judgment-call flag at the end of the chat reply (e.g. *"This is Part I on GPAI obligations. The high-risk and sanctions blocks would each stand as their own Part if you want to extend."*), and wait for Arturo to trigger the next part as a new conversation. No series infrastructure exists beyond `<Callback>` for linking parts — don't pre-build it.

The variable is the writing-to-source ratio. Match the source.

## Fluidity

Glossa pieces should be entertaining to read. Not entertaining the way a listicle is — entertaining the way a well-written long-form magazine essay is. The reader should want to keep going.

Three things kill fluidity:
1. **Scaffolding prose.** "The first channel is accuracy. The second channel is rule of law. The third channel is dignity." This reads like a lecture outline. Weave arguments together; use narrative transitions; let each section earn its right to exist by doing something the previous one didn't.
2. **Abstraction without anchor.** Don't write three paragraphs about "due process theory" before giving the reader a person, a court case, or a specific algorithm failure. Lead with the concrete, then explain why it matters.
3. **Under-glossing dense sources.** A reader who has to stop and Google a concept has lost momentum. Academic and legal sources need more context boxes than podcasts. 5–8 context boxes for a law review article is not too many — it's the editorial work that makes the piece accessible to someone who isn't a specialist.

## Editorial voice

Read `references/editorial-conventions.md` before writing. The short version:

- **Framing matters more than coverage.** A Glossa piece is not a transcript and not a summary — it's a guided reading. Every section earns its existence by adding context, structure, or analytical lift the source assumed.
- **No sycophancy, no padding, no AI-tells.** Write like a magazine editor who respects the reader's time. Avoid summary sentences that restate what was just said. Avoid academic hedging.
- **Keep cognitive load low.** Limit subordination to two levels per sentence; vary rhythm so short sentences punctuate long ones (target a 2:1 short-to-long ratio); split inline `Primero / Segundo` patterns into their own paragraphs when each carries weight. Most readers are on mobile and the working-memory cost is real. See `references/editorial-conventions.md § Sentence syntax`.
- **Gloss technical terms inline on first appearance.** Latin terms (ex ante, ex post), acronyms (LbD, RGPD, AI RMF), untranslated terms (smart contract, oráculo, Brussels Effect), field neologisms (onlife). Em-dash interpolation in six words or fewer. Never repeat. Exhibits must be readable standalone — gloss their acronyms locally if needed. See `§ Inline glossing for technical terms`.
- **Pedagogical hinges on organizing concepts.** Every piece has passages where a single distinction or concept organizes everything that follows — *as many as the source warrants*, not a fixed count. On those passages, expand: concrete anchor first, name after, sub-terms glossed inline, abstract opposition recast as two concrete questions, close with a reflection prompt. A narrative interview may have one hinge; a dense paper may have five. Don't apply this to every paragraph — that converts the piece into a textbook. See `§ Pedagogical hinges`. If Arturo asks for a piece that is "más accesible" or "para seminario," lean toward more hinges; if he asks for strict academic-magazine register, reduce to zero.
- **One italicized phrase per headline** (in `<em>` tags) — the visual signature.
- **Partisan sources need a context box on the speaker.** When the source has a clear ideological frame, introduce who they are upfront so the rest can use their voice as theirs without endorsing it. Use "X argues" / "in X's view" framing throughout.
- **Cross-issue callbacks.** When themes recur, link to the earlier piece with the `<Callback>` component.

## Tracks

Frontmatter has a `track` field. Default is `general`. Other values:
- `thesis` — academic register, footnotes via `<Footnote n={1}/>` and `<Footnotes notes={[...]}/>` block, stricter Spanish (see `spanish-academic-writing` skill if available)
- `ai-policy` — technical register, regulatory vocabulary, dense
- `finance` — quantitative, precise about numbers and units
- `geopolitics` — historically grounded, careful with partisan framing

Same skill, different rendering. The track triggers register changes, not infrastructure changes. Don't pre-design taxonomy; only add a track when there's a real piece for it. Default everything to `general` until a pattern emerges.

## Visual design

Cream paper (`#F4EDE0`), Spectral serif body, IBM Plex Sans for labels. Oxblood (`#7A1F1F`) is the accent — used for source links, exhibit labels, callback titles, lang-switch active state. The masthead is restrained: brand left, lang/size switch right.

The design is **quiet long-form**, not magazine cover. No drop caps. No hero kicker. No dramatic display headlines. The point is *for you to read carefully*, not for showing the link.

The palette and typography are defined once in `src/styles/global.css`. New articles inherit automatically — there's no per-article CSS. Hardcoded hex values inside SVG exhibits should match: use `#F4EDE0` for any rect/path meant to match the page background.

## Exhibits — data only

Exhibits come in two tiers. **Default to static.** Reach for interactive only when the interaction itself adds understanding the static version can't provide.

### Static exhibits (default)

Five types in `src/components/exhibits/`. All HTML/CSS-based (except Timeline's desktop layout, which is SVG); all responsive down to 360px viewport without overflow or unreadable text.

- `<Timeline events={[{year, label}, ...]} />` — horizontal SVG axis on desktop; vertical list on mobile (switched automatically below 640px)
- `<Bars items={[{label, value, note?, accent?}, ...]} unit="" />` — quantitative comparison; bars become full-width with values stacked below on mobile
- `<Scorecard columns={[...]} rows={[{label, values}]} />` — ✓/✗ matrix using CSS Grid + subgrid; converts to per-row cards on mobile
- `<Document header body={[...]} stamp />` — official-notice mockup, monospace; padding adjusts on mobile
- `<Comparison leftLabel rightLabel rows={[{left, right}]} />` — two-column on desktop; stacks vertically with section labels on mobile

### Interactive exhibits

Four React components in `src/components/exhibits/interactive/`, rendered as Astro islands with `client:visible` so they only hydrate when scrolled into view.

- `<InteractiveMatrix client:visible columns={...} rows={[{label, values, context?}]} />` — Scorecard with sortable columns and per-row expandable context paragraphs. Use for thesis correspondence tables (EU AI Act ↔ NIST RMF) where each correspondence has nuance worth a sentence.
- `<AnnotatedChart client:visible data={...} annotations={[{x, y, label, description?}]} type="line"|"area" />` — Recharts time-series with hoverable annotation markers and a paired annotation list. Use when 3+ inflection points need explanation.
- `<ComparisonToggle client:visible views={[{label, paragraphs: [...]}]} />` — switch between two or more framings of the same material. Use when the comparison itself is the editorial argument (Lectura A vs Lectura B; plain vs technical reading).
- `<ExplorableTimeline client:visible events={[{year, label, context?}]} />` — vertical timeline where each event can be expanded for context. Use when events benefit from optional background the reader can choose to read or skip.

Each requires an explicit import at the top of the MDX file:

```mdx
import InteractiveMatrix from '../../../../components/exhibits/interactive/InteractiveMatrix.jsx';
```

Full prop reference and worked examples in `src/components/exhibits/interactive/README.md`.

### When to reach for interactive

Test: would removing the interaction make the piece worse, or just less shiny? If the latter, use the static version. The interaction has to do work — sorting reveals an ordering, expanding reveals a paragraph that wouldn't fit in the matrix cell, toggling reveals a parallel reading. If it's just "look it moves," ship static.

Other defaults that don't change:

- **No representational illustration.** No maps, portraits, scenes, drawn diagrams. The data-only constraint applies to interactive exhibits too. For geography: prose ("the strait is 33 km wide") or a real Wikimedia Commons image. Never draw.
- **Zero exhibits is fine.** If the piece doesn't need one, ship without one.
- **`<Exhibit>` wrapper** still exists for fully bespoke needs not covered by the nine components above. Reach for it last.

## Orientation block

A short surface card before the Lede, previewing the concepts and ideas the reader is about to encounter. **Going-forward articles only** — existing pieces are not retrofitted.

Write threads as **concept-pointers, not "what you'll learn" sentences**. Each thread is a noun phrase or short clause that names something the piece will touch — a mechanism, a distinction, a claim, a tension. The number of threads is source-driven; let the text decide.

Mechanics:
- Each thread is a plain `<p>` element inside `<Orientation>`. The dash prefix and label are rendered by CSS — don't write them yourself.
- The `lang` prop sets the label ("In this reading" / "En esta lectura"). Required when writing ES.
- Use `<em>` for concept names worth surfacing in italics.

Good threads:
- *"How a single jurisdiction globalises its standards without treaties or coercion."*
- *"The distinction between* legal by design *and* legal protection by design *— and why it survives or fails the move into computational systems."*

Bad threads (too generic / too meta):
- *"The article explains how the EU sets global standards."*
- *"An overview of Hildebrandt's argument."*

The orientation is optional — short pieces that don't need it (≤ ~1,500 words on a single contained argument) can omit it. For thesis-track, ai-policy, and dense geopolitics pieces, default to including it.

## The components, briefly

In `src/components/`:

- `<Lede>` — first paragraph (no drop cap)
- `<Orientation lang="en">` — pre-Lede surface card; concept-thread preview of what the piece covers (going-forward articles only)
- `<Section number="01" title="Section title with <em>emphasis</em>">...</Section>` — section with number + h2
- `<Standfirst>` — italic intro to a section
- `<ContextBox label="What is X?">` — cream box with oxblood border, for assumed concepts
- `<InlineNote>` — top-and-bottom rule, sans-serif, smaller; for one-line clarifications
- `<QABlock speaker="Name">` — speaker label + cleaned quote
- `<PullQuote attribution="— X">` — the line that earns being magnified
- `<Callback issue="N° 03" slug="..." lang="en">` — link to another piece
- `<Footnote n={1}/>` and `<Footnotes notes={[...]}/>` — for thesis track

## Authoring a new issue

A new issue is **two MDX files** (or one if EN-only):

```
src/content/articles/{slug}/
  en.mdx
  es.mdx     # optional — only if Arturo wants Spanish
```

The slug is `firstname-keyword` or `topic-keyword`. Astro derives the URL: `articles/{slug}/{lang}/`.

### Frontmatter (required)

```yaml
---
issue: "N° 06"
date: "20 May 2026"
sortDate: "2026-05-20"
language: en
title: "Plain title without HTML"
titleHTML: "Title with <em>emphasis</em>"
dek: "Plain dek text"
dekHTML: "Dek with <em>optional</em> emphasis"
coverDek: "Standalone teaser for someone browsing the cover"
source: "Based on a conversation with X · Y"
sourceLabel: "No. 06 · From Y"
track: general
topics:
  - "Topic 1"
  - "Topic 2"
  - "Topic 3"
  - "Topic 4"
---
```

The cover regenerates from the union of EN article frontmatter — no separate `index.html` to update. Issues sort by `sortDate` descending.

### Body

Import components at the top of the body, then use them inline:

```mdx
import Lede from '../../../components/Lede.astro';
import Orientation from '../../../components/Orientation.astro';
import Section from '../../../components/Section.astro';
import Standfirst from '../../../components/Standfirst.astro';
import ContextBox from '../../../components/ContextBox.astro';
import QABlock from '../../../components/QABlock.astro';
import PullQuote from '../../../components/PullQuote.astro';
import Callback from '../../../components/Callback.astro';
import Timeline from '../../../components/exhibits/Timeline.astro';
import Bars from '../../../components/exhibits/Bars.astro';

<Orientation lang="en">
<p>First concept-thread — what the piece touches, in a noun phrase or short clause.</p>
<p>Second thread — a distinction, mechanism, or tension the reader will encounter.</p>
<p>Third thread — why this matters / what it connects to.</p>
</Orientation>

<Lede>First paragraph that introduces the piece.</Lede>

<Callback issue="N° 03" slug="ai-act-trilogue-stalled">Related context.</Callback>

<Section number="01" title="Section title with <em>emphasis</em>">

<Standfirst>Italic intro to the section.</Standfirst>

Body paragraph one. Plain markdown. Astro renders as `<p>` with global styles applied.

<ContextBox label="What is GPAI?">
Two sentences of background that the source assumed.
</ContextBox>

<Bars
  items={[
    { label: "U.S. revenue", value: 5, display: "$5T" },
    { label: "U.S. spending", value: 7, display: "$7T", accent: true },
  ]}
/>

</Section>
```

## Bilingual production

Read `references/spanish-translation.md` before translating.

ES is **optional per piece**. If Arturo wants ES, do it in the same conversation as EN — the Spanish version inherits the editorial decisions about register, terminology, and emphasis from the English. Don't ship as a separate session; the translation drift is real.

Default decision: produce ES if the piece is on a track that benefits from it (thesis, geopolitics, finance — anything where Spanish-language readers are part of the audience), or if Arturo asks for it. EN-only is fine for transient pieces.

The most common Spanish pitfalls:

- **`billion` is a false friend.** English "billion" = Spanish "mil millones" (10⁹). Spanish "billón" = English "trillion" (10¹²). $5 trillion → "5 billones." $160 billion → "160.000 millones." Get this wrong and the article is misinformation.
- **Beijing → Pekín** in Spanish convention.
- **Operation names** stay in English, italicized: "*Operation Epic Fury*" — don't translate.
- **Iberian register**, not Latin American.
- **Technical vocabulary is fine; bureaucratic register is not.** "Impugnación" is precise and necessary. "Decisores" is a calque that should be "quienes deciden." "Progenitores" is BOE-speak for "padres." Read the calques table in `spanish-translation.md` every time.
- **Number formatting**: Spanish uses `.` for thousands, `,` for decimals. "13.000 millones de dólares."
- **Translate every label inside SVG exhibits** when the piece has them.

## Cover page

The cover is **generated from article frontmatter at build time** (`src/pages/index.astro`). You don't edit it. Each EN article's `coverDek`, `topics`, `issue`, `date`, `track`, and `titleHTML` populate the corresponding card. Sort order is `sortDate` descending.

The cover dek is different from the article hero dek. The article's hero dek is one italic sentence dropping the reader into the substance. The cover's dek is a 2-3 sentence teaser written for someone browsing the index.

Topics: 4-5 short noun phrases. Specific enough to differentiate this piece from others. Mix scales — one big concept, one specific entity, one place, one mechanism, one analytical frame.

## Deployment

See `references/deployment.md`. Short version: every push to `main` triggers Vercel to run `astro build` and deploy.

Desktop / Cowork:
```bash
git clone https://github.com/aauml/glossa.git   # or reuse a checkout
cd glossa
mkdir -p src/content/articles/{slug}
# write en.mdx and es.mdx  (push only after the review gate — see Entry modes and gates)
git add -A && git commit -m "N° XX — short title" && git push
```
The repo was renamed `aauml/lecturas` → `aauml/glossa`; GitHub redirects old URLs and Vercel is linked by repo ID, so the deploy and the `glossa.ademas.ai` URL are unaffected.

**Chat / mobile has NO git.** Do not push or use GitHub's Contents API from chat, and do not try to compose a giant SQL `INSERT` (it stalls). **Publish from chat with ONE HTTP POST to the public `glossa-enqueue` edge function** — the same kind of call as `semantic-search`. The function inserts the queue row server-side; a GitHub Action (`glossa-publish.yml`) materializes the MDX into the repo, Vercel deploys, and the live URLs are written back.

Chat / mobile publish (only after the review gate / Arturo's OK) — **one call**:
```
POST https://wtwuvrtmadnlezkbesqp.supabase.co/functions/v1/glossa-enqueue
Content-Type: application/json
```
```jsonc
{
  "slug": "newissue-keyword",
  "issue_no": "N° XX",
  "issue_id": "<glossa_issues.id, or omit>",
  "body_en": "---\nissue: \"N° XX\"\n...COMPLETE en.mdx (frontmatter + imports + body)...",
  "body_es": "---\n...COMPLETE es.mdx...",   // omit if EN-only
  "sources_json": { /* the sources.json sidecar, or omit */ }
}
```
The response is `{ "ok": true, "id": "<uuid>", "poll": "<sql>" }`. No auth header is required (public function); if your client insists on one, send the anon key.

Then poll for the result (flips `queued → building → done`), via the Supabase connector or a GET on the REST table:
```sql
select state, url_en, url_es, error from glossa_publish_requests where id = '<id>';
```
On `state='done'`, reply with `url_en` / `url_es`. On `state='error'`, report `error` and re-POST a corrected article. Round-trip ≈ 1–2 min.

*(Alternative, only if a surface can write tables directly: INSERT the same fields into `glossa_publish_requests` with `state='queued'`. The edge-function POST is preferred because it never stalls on large bodies.)*

After publish (any surface), verify the live URLs:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://glossa.ademas.ai/
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://glossa.ademas.ai/articles/{slug}/en/
```

## When to ask vs. when to proceed

**Editorial decisions are autonomous; the two compuertas are not.** Glossa keeps the old `lecturas` speed on everything editorial — and honors exactly two human gates, because the portfolio's value is the proof that the *thinking* is Arturo's.

**Proceed silently on (never ask):** slug, headline, dek, section breakdown, length tier, which threads to follow, whether the source is editorially contested, exhibit choices, whether ES is in scope. If a 2-hour podcast covers five unrelated threads, pick the strongest. Arturo edits or asks for a redo after he sees the draft. No proposals, no plans, no "quick check before I start," no outline/slug/word-count confirmations.

**Stop and wait at the two gates (see *Entry modes and gates*):**
1. **Framing gate** — only in material-first modes (fuente / pregunta / vigilancia / dialectica): after the research digest, surface the findings and let Arturo fix the thesis before you write the seed or draft. In tesis / serie modes the thesis is already set — skip this gate.
2. **Review gate** — always for a Glossa piece: present the EN/ES draft and the source list for review **before** pushing. Do not auto-publish. Push only on Arturo's OK.

These gates are about *substance* (the thesis, the published artifact), not *process*. They are not an invitation to re-introduce outline-confirmation theater. If Arturo explicitly says "just publish it" / "ship directly," collapse the review gate for that piece.

No credential is needed from Arturo on chat: KB reads use the Supabase connector / public edge function, and publishing goes through the `glossa_publish_requests` queue (the worker holds the secrets). Just operate; surface nothing except at the gates.

If a judgment call genuinely affects the framing (you treated a partisan figure with neutral voice; you cut a section the source emphasized), flag it in **one sentence** when you present the draft.

What this still rules out:
- "I'm thinking of slug `foo-bar` — sound right?"
- "Here's the section breakdown — want to adjust?"
- "I'm planning ~3,000 words — confirm?"

Those are editorial; just decide. The thesis and the publish step are the gates.

## Mobile output discipline

On chat/mobile, publishing is a single **POST to the `glossa-enqueue` edge function** (the full `en.mdx`/`es.mdx` go in `body_en`/`body_es`), not a file upload and not a SQL INSERT — so the old chunked-PUT concerns are gone. Two rules remain:

1. **Build the MDX, then publish in one POST.** Assemble each file's text, then POST. If a file is too large for one tool call, build it across calls in sandbox state and POST once it's whole.
2. **Status output, not content output, in chat.** After publishing, reply with the live URLs and nothing else (one sentence only if a framing judgment call needs flagging).

See `references/deployment.md` for the full chat-publish (Supabase queue) flow and the Code/Cowork git flow.

## Delivery — what to send back to Arturo

After deploying, the chat reply is short. The pattern:

1. The live URLs (cover or new piece). 
2. Done.

That is the entire delivery. No retrospective. No comparison to previous issues. No "pipeline assessment." No "editorial notes" sections unless there's a specific judgment call he should know about — one sentence, not a section.

## Files in this skill

Packaged with the skill (always available, any surface):
- `SKILL.md` — this file
- `references/editorial-conventions.md` — voice, framings, established patterns
- `references/spanish-translation.md` — Iberian register, the billion trap, key terminology
- `references/deployment.md` — both deploy flows (Code/Cowork git; chat Supabase queue), frontmatter spec, MDX conventions

In the repo `aauml/glossa` (read when you have a checkout — Code/Cowork):
- `src/components/exhibits/interactive/README.md` — prop reference for the interactive React exhibits
- `src/components/`, `src/styles/global.css` — the live design system (source of truth for component props)

## What to do first when triggered

1. Determine the **entry mode** (tesis / serie / fuente / pregunta / vigilancia / dialectica) and the **intake mode** (A: source provided / B: topic only) from the input shape. No confirmation question.
2. **Research — KB first, then the web.** Query `evaluated_items` for relevant curated sources, then verify (Mode A) or gather (Mode B) with the web. On **chat/mobile** this works without a shell: read the KB via the **Supabase connector** (REST `select` with `ilike` filters on `title`/`thesis_relevance`/`importance`), and/or call the **public `semantic-search` edge function** (`POST {project}.supabase.co/functions/v1/semantic-search` with `{query, match_count, match_threshold}` — no JWT). Web/academic: native connectors (web search, Scholar/Consensus) or Tavily/OpenAlex. Build a small brief; capture each KB source's `pk`.
3. **Framing gate** (material-first modes only): present the digest, let Arturo fix the thesis. Then write the `glossa_seeds` row (dated authorship) and a `glossa_issues` row — via the Supabase connector (anon key; RLS allows it). Advance `status` `researching→drafting`.
4. Read `references/editorial-conventions.md` before writing. Decide slug, headline (with `<em>`), dek, sections, and whether ES is in scope — silently.
5. Write the complete `en.mdx` (+ `es.mdx` if in scope) and the `sources.json` sidecar. Run the pre-publish checklist (audit pattern above).
6. **Review gate:** present the EN/ES draft + source list for Arturo's OK. Do not publish yet (unless he said "ship directly").
7. **On approval — publish by the surface you're on:**
   - **Code / Cowork (has git):** write the files into a checkout of `aauml/glossa`, `git commit` + `push`. Vercel deploys.
   - **Chat / mobile (no git):** POST the finished MDX to the public `glossa-enqueue` edge function (one call, like `semantic-search`); poll `glossa_publish_requests` by the returned `id` until `state='done'`; the worker commits, deploys, and returns the URLs (see *Deployment*).
8. Write `glossa_issue_sources` (KB sources with role/claim/verified) and ensure the issue is `status='published'` with `url_en/url_es`, `published_at`, `model`. (The chat publish worker sets the issue's status/URLs for you when `issue_id` is provided.)
9. Reply with the live URLs (and one sentence on any framing judgment call).
