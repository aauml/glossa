# Deployment

## Architecture

Astro site, Vercel-hosted, GitHub-backed. Every push to `main` of `aauml/glossa` triggers `astro build` and a fresh deploy. (Repo renamed from `aauml/lecturas`; GitHub redirects old URLs and Vercel links by project id, so the alias below is unchanged.)

- **GitHub repo**: `aauml/glossa` (public, formerly `aauml/lecturas`)
- **Vercel project**: `lecturas` in team `ayalaax-6763s-projects` (id: `team_PCfVDieErgkV66bd9jvNg32g`, project id: `prj_DnoxPEwO3xw8DZPUvIsAwwQVtTP0`)
- **Production alias**: `https://glossa.ademas.ai`
- **Build trigger**: every commit to `main` → Vercel webhook → `npm run build` → live in ~60s

## Repo layout

```
src/
  layouts/
    BaseLayout.astro          # <head>, fonts, size-toggle script
    ArticleLayout.astro       # masthead + hero + <article> wrapper
    CoverLayout.astro         # masthead, used by the index
  components/
    ArticleMasthead.astro
    CoverMasthead.astro
    SizeSwitch.astro
    Lede.astro
    Section.astro
    Standfirst.astro
    ContextBox.astro
    InlineNote.astro
    QABlock.astro
    PullQuote.astro
    Callback.astro
    Footnote.astro
    Footnotes.astro
    Exhibit.astro             # bespoke wrapper (use last)
    exhibits/
      Timeline.astro
      Bars.astro
      Scorecard.astro
      Document.astro
      Comparison.astro
  styles/
    global.css                # the entire design system
  content/
    config.ts                 # collection schema (Zod)
    articles/
      {slug}/
        en.mdx
        es.mdx                # optional
  pages/
    index.astro               # cover, generated from articles
    articles/[slug]/[lang]/
      index.astro
```

## Auth — two surfaces, two paths

- **Code / Cowork (has git):** an authenticated git remote (the `aauml` user via `gh`, or a checkout). Write files, `git commit`, `git push`. No PAT handling in the conversation.
- **Chat / mobile (NO git):** publishing goes through Supabase. The chat writes the MDX into `glossa_publish_requests` (anon key, via the Supabase connector); a GitHub Action (`glossa-publish.yml`) holds the real secrets (`OP_SERVICE_ACCOUNT_TOKEN` → 1Password → Supabase service key) and does the commit/push. **No GitHub PAT is needed or used on chat.** Do not attempt the GitHub Contents API from mobile.

## Frontmatter spec

Required fields:

```yaml
---
issue: "N° 06"                # display label
date: "20 May 2026"           # display date
sortDate: "2026-05-20"        # ISO date for sort; lexicographic
language: en                  # or es
title: "Plain title text"
titleHTML: "Title with <em>emphasis</em>"
dek: "Plain dek text"
dekHTML: "Dek with optional <em>emphasis</em>"
coverDek: "Standalone teaser written for cover browsing"
source: "Based on a conversation with X · Y"
sourceLabel: "No. 06 · From Y"
topics:
  - "Topic 1"
  - "Topic 2"
  - "Topic 3"
  - "Topic 4"
---
```

Optional fields:

```yaml
track: general    # default. other values: thesis, ai-policy, finance, geopolitics
hidden: false     # set true to hide from cover (drafts, archived)
```

## Body conventions

Import components at the top, then use them inline. Order is `<Lede>` → optional `<Callback>` → `<Section>` blocks → optional `<Footnotes>` (thesis track only).

```mdx
---
[frontmatter]
---

import Lede from '../../../components/Lede.astro';
import Section from '../../../components/Section.astro';
import Standfirst from '../../../components/Standfirst.astro';
import ContextBox from '../../../components/ContextBox.astro';
import InlineNote from '../../../components/InlineNote.astro';
import QABlock from '../../../components/QABlock.astro';
import PullQuote from '../../../components/PullQuote.astro';
import Callback from '../../../components/Callback.astro';
import Timeline from '../../../components/exhibits/Timeline.astro';
import Bars from '../../../components/exhibits/Bars.astro';
import Scorecard from '../../../components/exhibits/Scorecard.astro';
import Document from '../../../components/exhibits/Document.astro';
import Comparison from '../../../components/exhibits/Comparison.astro';
import Footnote from '../../../components/Footnote.astro';
import Footnotes from '../../../components/Footnotes.astro';

<Lede>First paragraph.</Lede>

<Section number="01" title="Section title with <em>emphasis</em>">

<Standfirst>Italic intro.</Standfirst>

Body paragraph.

<ContextBox label="What is X?">
Two sentences of background.
</ContextBox>

<Bars items={[
  { label: "Revenue", value: 5, display: "$5T" },
  { label: "Spending", value: 7, display: "$7T", accent: true },
]} />

</Section>
```

Only import the components you actually use.

## Exhibit components (data only)

The five accepted exhibit types:

- **`<Timeline events={[{year, label}, ...]} />`** — dated markers along an axis
- **`<Bars items={[{label, value, note?, display?, accent?}, ...]} unit?="" />`** — quantitative comparison
- **`<Scorecard columns={[...]} rows={[{label, values: [bool|str, ...]}, ...]} />`** — ✓/✗ matrix
- **`<Document header? body={[...]} stamp? />`** — official-notice mockup
- **`<Comparison leftLabel rightLabel rows={[{left, right}, ...]} />`** — two-column

All take a wrapper props: `label?`, `title?`, `subtitle?`, `source?`.

The bespoke `<Exhibit>` wrapper still exists for unusual cases. Reach for it last; default to one of the five.

**No maps, portraits, scenes, or representational illustration.** Where geography matters: prose, or `<img src="https://upload.wikimedia.org/...">` from Wikimedia Commons.

## Deploy flow — desktop / Cowork (shell)

```bash
git clone https://aauml:${LECTURAS_PAT}@github.com/aauml/glossa.git ~/glossa  # if not cloned
cd ~/glossa
mkdir -p src/content/articles/{slug}
# write en.mdx (and es.mdx if ES in scope)
git add -A
git commit -m "N° XX — short title"
git push
```

Vercel handles the rest. Verify:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://glossa.ademas.ai/
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://glossa.ademas.ai/articles/{slug}/en/
[ -f src/content/articles/{slug}/es.mdx ] && curl -s -o /dev/null -w "HTTP %{http_code}\n" https://glossa.ademas.ai/articles/{slug}/es/
```

## Deploy flow — chat / mobile (no git): the Supabase publish queue

Chat/mobile cannot push to GitHub. Instead, **POST the finished article to the public `glossa-enqueue` edge function** (one HTTP call, like `semantic-search`). The function inserts the queue row server-side; a GitHub Action (`.github/workflows/glossa-publish.yml`) materializes it into the repo and Vercel deploys. Round-trip ≈ 1–2 min. (Do NOT try to compose a big SQL `INSERT` from chat — it stalls on the multi-KB body.)

### How it works (the bridge)
1. Chat `POST`s the article to `…/functions/v1/glossa-enqueue` (public, no JWT). The function inserts a `glossa_publish_requests` row with `state='queued'` using the service key, and returns `{ ok, id }`.
2. A DB trigger (`glossa_publish_dispatch`, migration 0002) fires `pg_net` → GitHub `repository_dispatch` (`event_type: glossa_publish`), using `github_dispatch_pat` from the Supabase Vault.
3. `glossa-publish.yml` reads the row with the public anon key (`scripts/publish_from_supabase.mjs prepare`), writes `src/content/articles/{slug}/{en,es}.mdx` (+ `sources.json`), runs `npm run build` to validate, `git commit` + `push`. Vercel deploys.
4. The worker (`… finalize`) writes `state='done'`, `commit_sha`, `url_en`, `url_es` back to the row, and flips the linked `glossa_issues` to `published`.

### Publish (one POST)

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
  "sources_json": { /* the sources.json sidecar object, or omit */ }
}
```
Response: `{ "ok": true, "id": "<uuid>", "poll": "<sql>" }`. No auth header required (public); send the anon key only if your client demands one.

`body_en`/`body_es` are the **entire** MDX files — same content the Code/Cowork flow would commit, carried in the POST instead of a file.

### Poll for the result

```sql
select state, url_en, url_es, commit_sha, error
from glossa_publish_requests
where id = '<returned id>';
-- state: queued -> building -> done | error
```

### Final chat reply (on `state='done'`)

```
Live:
- EN: {url_en}
[- ES: {url_es}  if ES in scope]
```

If `state='error'`, report `error` (usually a build/validation failure) and fix the MDX, then INSERT a fresh queued row.

## Working on the design system

Everything visual lives in code. To change typography, palette, or layout once across all articles past and future:

- `src/styles/global.css` — palette, typography, all classes
- `src/layouts/*.astro` — structural HTML
- `src/components/*.astro` — editorial components
- `src/components/exhibits/*.astro` — data exhibits

Edit, commit, push. Vercel rebuilds. Every issue picks up the change.

## Troubleshooting

- **Vercel build error: "data does not match collection schema"** — frontmatter missing a required field or wrong type. The error names slug + field. Fix YAML, push.
- **Article 404 after push** — file path wrong. Must be exactly `src/content/articles/{slug}/{en|es}.mdx`.
- **403 on Contents API** — PAT expired or insufficient scope. Check at `https://github.com/settings/personal-access-tokens`.
- **422 on Contents API** — `sha` is stale (someone else committed between your GET and PUT). Re-fetch and retry.
- **Vercel deployed but cover stale** — generated at build time; check the deployment commit SHA matches your push.
- **CSS missing** — usually means an import was missed in BaseLayout. Should never happen for normal article work.
- **MDX parse error on `<` in body text** — escape with `&lt;` or wrap raw HTML in `<Fragment set:html={`...`} />`.

## What you no longer do

- No `vercel deploy` calls
- No zip rebuild
- No `present_files` step
- No cover hand-edits
- No CSS edits per article
- No "ask for a token" — the PAT is long-lived
- No representational SVGs (maps, portraits, scenes) — refused
- No prefixed length targets — source-driven
