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

## Auth

A long-lived GitHub PAT named `lecturas-deploy` is provisioned on the `aauml` user with `Contents: Read and write` and `Administration: Read and write`. It does not expire.

The PAT lives in Arturo's **claude.ai personal preferences** as a line like:

```
LECTURAS_PAT: github_pat_11BLSTNNQ0...
```

**Personal preferences are inserted into the model's system prompt as text — they are NOT environment variables.** `os.environ.get("LECTURAS_PAT")` returns `None` in any sandbox. Read the value from the `<user_preferences>` block in your system prompt and paste it directly into Python code as a string literal. Only ask Arturo to paste it if it is genuinely missing.

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

## Deploy flow — mobile / claude.ai Chat

Use the analysis tool's Python sandbox to PUT MDX files via GitHub's Contents API.

### Hard rules

- **Analysis tool only.** Never claude.ai's file-creation UI, artifact panel, canvas, or "create file" affordance — they stream content through the chat response and hit the per-message cap. The analysis tool is the only mechanism that scales.
- **PAT comes from preferences (`<user_preferences>`), not `os.environ`.** Paste the literal value.
- **MDX files are now small (~8-15KB)** so a single tool call can usually hold one. If you find one approaching the cap, split into multiple `parts.append(...)` across tool calls — Python state persists.
- **Status output only in chat.** Three lines plus URL. No HTML preview.

### Setup (call 1)

```python
import base64, requests

PAT = "github_pat_REPLACE_WITH_VALUE_FROM_PREFERENCES"
OWNER, REPO, BRANCH = "aauml", "glossa", "main"
HEADERS = {"Authorization": f"Bearer {PAT}", "Accept": "application/vnd.github+json"}
API = f"https://api.github.com/repos/{OWNER}/{REPO}"

def put_file(path, content_bytes, message):
    r = requests.get(f"{API}/contents/{path}", params={"ref": BRANCH}, headers=HEADERS)
    sha = r.json().get("sha") if r.status_code == 200 else None
    body = {"message": message, "content": base64.b64encode(content_bytes).decode(), "branch": BRANCH}
    if sha: body["sha"] = sha
    r = requests.put(f"{API}/contents/{path}", json=body, headers=HEADERS)
    r.raise_for_status()
    return r.json()["commit"]["sha"]
```

### Build and push EN (call 2)

```python
slug = "newissue-keyword"

en_mdx = """---
issue: "N° XX"
date: "DD MMM YYYY"
sortDate: "YYYY-MM-DD"
language: en
track: general
title: "..."
titleHTML: "...<em>...</em>"
dek: "..."
coverDek: "..."
source: "..."
sourceLabel: "..."
topics:
  - "..."
  - "..."
  - "..."
  - "..."
---

import Lede from '../../../components/Lede.astro';
import Section from '../../../components/Section.astro';
import Standfirst from '../../../components/Standfirst.astro';
import ContextBox from '../../../components/ContextBox.astro';

<Lede>...</Lede>

<Section number="01" title="...with <em>emphasis</em>">

<Standfirst>...</Standfirst>

...paragraphs...

</Section>

<Section number="02" title="...">

...

</Section>
"""

sha = put_file(f"src/content/articles/{slug}/en.mdx", en_mdx.encode(), f"N° XX — EN")
print(f"EN ({len(en_mdx)//1024} KB) → {sha[:7]}")
del en_mdx
```

### Build and push ES (call 3, if ES in scope)

```python
es_mdx = """---
issue: "N° XX"
... (same metadata, language: es, ES values for title/dek/coverDek/sourceLabel)
---

[same imports, Spanish prose]
"""
sha = put_file(f"src/content/articles/{slug}/es.mdx", es_mdx.encode(), f"N° XX — ES")
print(f"ES ({len(es_mdx)//1024} KB) → {sha[:7]}")
del es_mdx
```

**No cover update step.** The cover regenerates from the article collection at build time.

### Verify (final call)

```python
import time
time.sleep(60)  # let Vercel build
for path in ["", f"articles/{slug}/en/"]:
    r = requests.get(f"https://glossa.ademas.ai/{path}")
    print(r.status_code, path or "(cover)")
```

### Final chat reply

```
EN (12 KB) → 7a3b...
[ES (11 KB) → 9c2d... if ES in scope]
Live: https://glossa.ademas.ai/articles/{slug}/en/
```

That's the entire delivery.

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
