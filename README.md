# Glossa

**Lecturas anotadas · dirección humana, ejecución asistida por IA.**

Glossa convierte una idea, una fuente o una pregunta en una **lectura anotada tipo revista, bilingüe (EN/ES), con procedencia verificable**. El pensamiento —análisis, hipótesis, tesis— es mío; la investigación, la verificación, la redacción y la publicación son asistidas por IA.

Es un proyecto personal: portafolio, aprendizaje, consumo y para compartir con quien quiera leerlo. Vive bajo el paraguas "AI" del portafolio.

---

## Principio rector

- **El pensamiento es mío; la ejecución es asistida.** El análisis, las hipótesis y las tesis los pongo yo. La máquina investiga, verifica, redacta y publica.
- **El portafolio no son los artículos: es la prueba de procedencia.** Lo valioso es el registro demostrable de que las ideas son mías y la ejecución asistida.
- **El modelo se alquila, el corpus se posee.** El diferenciador a años vista es un corpus curado y verificado que es mío, no el modelo de turno.
- **El sistema encarna lo que estudia.** Trazabilidad, supervisión humana y auditabilidad: gobernanza de IA aplicada a uno mismo.

---

## El nombre

**Glossa** (del latín *glossa*): una anotación que explica. Guiña a la *Glossa Ordinaria*, las anotaciones con que los juristas medievales glosaban el derecho romano hasta formar un aparato con autoridad propia —anotación + derecho + un corpus que compone. Y *glosa* (es) = *gloss* (en): misma palabra y mismo significado en los dos idiomas. En IA aplicada, una "gloss" es la anotación (la capa humana sobre la máquina).

Descriptor sugerido: *Glossa — lecturas anotadas · IA aplicada, dirección humana.*

---

## Cómo está organizado

| Doc | Contenido |
|---|---|
| [docs/01-Vision-y-Principios](docs/01-Vision-y-Principios.md) | Qué es, principio rector, principios de diseño |
| [docs/02-Arquitectura](docs/02-Arquitectura.md) | Las tres piezas, las cinco capas, *surface-agnostic* |
| [docs/03-Modos-Compuertas-y-Superficies](docs/03-Modos-Compuertas-y-Superficies.md) | Modos de entrada, compuertas humanas, dónde corre |
| [docs/04-Investigacion-y-KB](docs/04-Investigacion-y-KB.md) | Router de fuentes, catálogo de APIs, diseño del KB |
| [docs/05-Procedencia-y-Autoria](docs/05-Procedencia-y-Autoria.md) | Semilla, `sources.json`, registro, seguridad |
| [docs/06-Publicacion](docs/06-Publicacion.md) | Repo, MDX, despliegue, publicar desde el móvil |
| [docs/07-Roadmap](docs/07-Roadmap.md) | Fases MVP → producto |
| [docs/08-Marca-y-Nombre](docs/08-Marca-y-Nombre.md) | Glossa, bilingüismo, descriptor, voz |
| [docs/09-Decisiones-Abiertas](docs/09-Decisiones-Abiertas.md) | Lo que falta decidir |
| [docs/10-Modelos-y-Credenciales](docs/10-Modelos-y-Credenciales.md) | Reparto de modelos, OpenRouter, secretos vía 1Password |
| [docs/11-Integracion-phd-kb](docs/11-Integracion-phd-kb.md) | Glossa como dominio PUB sobre phd-kb; schema aplicado |
| [docs/12-Runbook-Code](docs/12-Runbook-Code.md) | Pasos para continuar la construcción en Claude Code |
| [docs/Glosario](docs/Glosario.md) | Términos del proyecto |

---

## Estado

**v0.1 — fase de diseño.** Documentación completa; aún sin construir. El primer hito de construcción es el MVP portátil (ver [Roadmap](docs/07-Roadmap.md)).

## Relación con "Lecturas"

Glossa es el nombre del proyecto y de la publicación. Evoluciona el skill `lecturas` y su sitio actual (`lecturas-ten.vercel.app`, repo `aauml/lecturas`). "Lecturas" suena bien en español pero engaña en inglés (*lectures* = conferencias); *Glossa/gloss* es la misma palabra en ambos idiomas. La migración del repo, el sitio y el dominio es una tarea pendiente listada en [Decisiones Abiertas](docs/09-Decisiones-Abiertas.md).
