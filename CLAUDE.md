# Glossa — CLAUDE.md

Guía para Claude al trabajar en este proyecto. El índice completo del diseño está
en [README.md](README.md), que enlaza los catorce documentos de [`docs/`](docs/).

> El índice vive en el README y se alcanza desde aquí a propósito: el recorrido de
> documentos de Umbrella arranca en este archivo, y un enlace a un *directorio* no
> es un fichero, así que los catorce salían como huérfanos aunque el README los
> listara. Si añades un documento, enlázalo desde el README.

## Recursos declarados (para Umbrella / Panel Madre)

**Contexto de cartera:** antes de resolver desde cero algo que otro proyecto ya
resolvió, lee el bloque **glossa** de la sección 7 del informe en
<https://github.com/aauml/umbrella/blob/main/reports/latest.md> — lista qué
capacidades ya existen en la cartera y en qué archivo, más las lecciones y
estándares de otros proyectos que tocan los servicios declarados aquí. Se
regenera a diario; Umbrella nunca escribe en este repo.

⚠️ **Este repo es público.** Es el único de los siete que lo es. Todo lo que se
añada a este bloque queda a la vista de cualquiera: no pongas aquí nombres de
cuentas, correos, identificadores de proyecto de un proveedor, ni nombres de
items de 1Password. Los proveedores y las rutas del propio repo son públicos de
todos modos; lo que los distingue de un secreto es que no dicen *cuál* cuenta.

Bloque de inventario cross-proyecto — ver `aauml/umbrella`. Actualizar si cambia el stack.

```yaml
resources:
  database:
    provider: Supabase (phd-kb)
    capability: relational database
    implemented_in: docs/11-Integracion-phd-kb.md
  vector_store:
    provider: Supabase (phd-kb)
    capability: vector database / embeddings
    implemented_in: scripts/research_from_supabase.mjs
  deployment:
    provider: Vercel
    capability: deployment / hosting
    implemented_in: skills/references/deployment.md
  dns:
    provider: Cloudflare
    capability: DNS / caching
  source_control:
    provider: GitHub
    capability: repository / CI-CD
    implemented_in: .github/workflows/glossa-publish.yml
    conforms_to: [STANDARD-DOC-ENTRYPOINT, STANDARD-PUBLISHED-OUTPUT]
  research_sources:
    - provider: GDELT
      capability: search / benchmarking
      notes: censo mundial de prensa, 65 idiomas, sin clave ni cupo (1 petición/5 s).
             Es la capa de ANCHURA - una consulta devolvió 250 articulos de 213
             medios y ~30 paises, con la URL real, asi que el texto se lee gratis.
             Lo de pago (Tavily) queda para lo que esto no alcanza. Ver D-023
      implemented_in: src/lib/gdelt.mjs
    - provider: Google News RSS
      capability: search / benchmarking
      notes: reserva del censo cuando GDELT no contesta. Sin clave ni cupo, 58
             pares pais/idioma, pero solo titular y medio - el enlace va cifrado
      implemented_in: src/lib/gnews.mjs
    - provider: OpenAlex
      capability: search / benchmarking
      implemented_in: scripts/research_from_supabase.mjs
    - provider: Tavily
      capability: search / benchmarking
      notes: cuenta propia de Glossa desde 2026-08-22; compartirla con otro proyecto
             habría dejado a ambos peleando por la misma cuota (ver D-009).
             Tres consumidores con presupuestos separados - cotejo (verificar una
             afirmacion), monitores (seguir un tema o una persona) y reportaje
             (salir a buscar un asunto de la semana en otros medios y paises, que
             es el unico que pide el texto entero)
      implemented_in: scripts/reportaje_from_supabase.mjs
  ai_models:
    - provider: Anthropic
      capability: LLM
      notes: análisis y redacción de las piezas, con Claude ejecutando skills/SKILL.md
      implemented_in: skills/SKILL.md
    - provider: Google Gemini
      capability: LLM
      notes: tramo gratuito; escucha los episodios y los clasifica por tema
      implemented_in: supabase/functions/_shared/gemini.ts
      intentional: true
    - provider: Moonshot (Kimi)
      capability: LLM
      notes: escribe el número semanal; elegido midiendo seis modelos, ver D-005
      implemented_in: scripts/weekly_from_supabase.mjs
      intentional: true
  media_discovery:
    provider: YouTube Data API
    capability: search / benchmarking
    notes: el RSS de YouTube devolvió 404 para todos los canales el 2026-08-21 y no volvió
    implemented_in: supabase/functions/_shared/feeds.ts
  monitoring:
    provider: GitHub Actions
    capability: monitoring / health checks
    notes: vigilante cada 4 h; detecta, recupera lo pasajero y anota lo demás.
           Se declara a propósito — thesis ya tenía `phd-agents/system_review` y
           no llegó nunca porque Umbrella enruta por capacidad declarada
    implemented_in: scripts/vigilante_from_supabase.mjs
  secrets:
    provider: 1Password
    capability: credential management
  site_framework:
    provider: Astro
    capability: static site generation
    implemented_in: astro.config.mjs
  design:
    provider: hand-rolled CSS variables
    capability: design system
    notes: papel crema / tinta cálida, acento oxblood; claro-oscuro por tokens, sin colores literales fuera de la paleta
    implemented_in: src/styles/global.css
  components:
    provider: Astro
    capability: component library
    notes: aparato de lectura anotada — Callback, ContextBox, PullQuote, Footnote, Exhibit, ReadingProgress, SizeSwitch
    implemented_in: src/components/
```

**Las rutas de `implemented_in` son relativas a la raíz del repo `aauml/glossa`**, que es la fuente de verdad. La carpeta de Drive es un espejo parcial: solo `docs/`, `db/migrations/` y este archivo. El código (`src/`, `scripts/`, `.github/`, `skills/`, `supabase/`) vive únicamente en el repo.

Nota: `provider` de la base de datos usa a propósito el mismo texto que declara `thesis-repo` (`Supabase (phd-kb)`) — es la MISMA cuenta/proyecto, reutilizada, no una copia. Glossa solo lee (`evaluated_items`, `semantic-search`), no administra el esquema ni escribe fuera de `glossa_*`. El KB vectorial lo posee `thesis-repo`; aquí `implemented_in` apunta a cómo se **consulta** desde un worker sin secretos.

Nota: el deployment sí existe y está en vivo — sitio Astro en Vercel, dominio `glossa.ademas.ai` (CNAME en Cloudflare → `cname.vercel-dns.com`, DNS-only). Cada push a `main` de `aauml/glossa` despliega.

Nota: lo más reutilizable de este repo es **publicar desde una superficie sin shell** (chat/móvil): `Supabase (cola) → pg_net → repository_dispatch → GitHub Action → commit → Vercel → write-back de URLs`. La cadena está documentada en la cabecera de `.github/workflows/glossa-publish.yml`; el mismo patrón, para investigación, en `.github/workflows/glossa-research.yml` + `scripts/research_from_supabase.mjs`.

Nota (2026-08-20, corrige lo anterior): el worker **no** corre *secretless*. Se intentó con la anon key pública y falló de las dos maneras posibles — dejó de funcionar el 2026-07-01 cuando `anon` perdió el UPDATE, y mientras funcionó era la misma apertura que permitía a cualquiera encolar una publicación. Ahora: la cola la escribe la **service key** desde GitHub Secrets, y la edge function `glossa-enqueue` exige la cabecera `x-glossa-token`. Si vas a reutilizar el patrón, cópialo con la compuerta, no sin ella.

Nota (corrige lo anterior): hasta el 2026-08-21 no había **ninguna** llamada a
una API de LLM en el código — el análisis y la redacción los hacía Claude
ejecutando `skills/SKILL.md`. Ya no. El radar llama a Gemini para escuchar los
episodios, y el número semanal llama a Kimi desde un GitHub Action. La redacción
de las piezas sigue siendo Claude en conversación; lo que se automatizó es la
lectura previa y la revista.

## 1Password — Acceso a secretos (ya configurado, headless)

`op` (1Password CLI) ya está autenticado de forma global con un service account de solo lectura vía `~/.zshenv`, en todas las sesiones. No hay que hacer login ni abrir la app de 1Password. Verifícalo: `op whoami` → User Type: SERVICE_ACCOUNT.

Todos los secretos viven en una sola bóveda, organizados por nombre con el
prefijo del proyecto al que pertenecen. **Los nombres concretos no se escriben
aquí**: este repo es público, y enumerarlos publicaría el mapa de credenciales
de los otros seis proyectos, que sí son privados. Descúbrelos en el momento con
`op item list` y filtra por el prefijo que necesites.

Leer un secreto (úsalo directo en variable, NO lo imprimas en el chat):

```bash
KEY=$(op item get "<NOMBRE DEL ITEM>" --vault "$OP_VAULT" --fields credential --reveal)
```

Ver los campos de un item: `op item get "<NOMBRE>" --vault "$OP_VAULT" --format json`

Listar/buscar items: `op item list --vault "$OP_VAULT"`

`OP_VAULT` es la bóveda única de la cartera; su nombre está en el entorno de la
sesión (`echo $OP_VAULT`) o se ve con `op vault list`. No se escribe en este
archivo por la misma razón que los nombres de los items.

Es solo lectura (no escribe/edita). Si una sesión vieja pide el master password, ciérrala y abre una nueva (o `exec zsh`) para que tome el token de `~/.zshenv`.

## Qué genera este proyecto y quién lo lee

Exigido por `STANDARD-PUBLISHED-OUTPUT` de la cartera: todo lo que se produce
necesita un consumidor **nombrado** y una prueba de que puede alcanzarlo. "Está
disponible por si alguien lo quiere" no es un consumidor.

| Se genera | Quién lo lee | Qué lo demuestra |
|---|---|---|
| Las 90 páginas del sitio | cualquiera, en `glossa.ademas.ai` | `scripts/check_content.mjs` en prebuild + los enlaces de la portada |
| `rss.xml` y `rss-es.xml` | lectores por RSS | `<link rel="alternate">` en cada página y en el sitemap |
| `sources.json` de cada pieza | el lector, al pie del artículo | `src/components/Sources.astro` lo renderiza; sin sidecar no pinta nada |
| Resúmenes y dossiers del radar (`glossa_radar_*`) | Arturo, en `/admin` | el panel es su única vista; **antes de existir no los leía nadie** |
| Expedientes de candidatos a fuente (`glossa_radar_candidatos`, `_menciones`) | el consejo del domingo, que decide altas y veredictos con ellos; Arturo en `/admin` solo veta | `scripts/consejo_from_supabase.mjs` fase 2 los consume; sección «Growing on its own» del panel |
| El cupo de Tavily y su reparto por tema | Arturo, en `/admin` | el panel enseña cuánto queda, a dónde fue y por qué, con los mandos para moverlo |

Esa última fila es justo el fallo que describe el estándar. Los dossiers del
radar se diseñaron sin lector: se habrían generado cada noche sin que nadie los
abriera, dando la falsa impresión de que el sistema funcionaba. El panel es lo
que convierte esa salida en algo consumido. Si algún día se retira el panel, hay
que retirar también lo que lo alimenta.
