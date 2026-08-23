# 14 · El censo y el cupo

> Cómo Glossa sale a buscar fuera sobre **todos** los asuntos de la semana sin
> que crecer la lista de fuentes cueste más dinero. Decisión de fondo:
> [D-023](../DECISIONS.md).

## El problema, dicho sin rodeos

Las fuentes seguidas **dan los temas, no el material**. Sobre cada asunto hay que
salir a la calle —en cualquier idioma y país—, corroborar o desmentir, y solo
entonces escribir.

Eso choca con una aritmética simple: la lista de fuentes va a seguir creciendo,
más fuentes son más asuntos, y más asuntos sobre el mismo cupo mensual de pago
significan **menos por asunto**. Un tope escrito a mano —«24 búsquedas por
semana»— no resuelve nada: es una cifra que envejece en cuanto se añade la fuente
número treinta y cuatro. Y así estaba: de los doce temas que veía el modelo,
salían a la calle **seis**, elegidos por volumen. Los otros seis se escribían con
lo que dijeron los canales y nada más, que es exactamente lo que la publicación
dice no hacer.

## La salida: que la anchura no cueste

```
┌─ Capa 1 · CENSO ────────── gratis, sobre TODOS los temas ──────────┐
│  GDELT (preferente) → Google News RSS (reserva)                    │
│  Devuelve: cuántos medios, qué países, qué idiomas, y cuánto se    │
│  parecen los titulares entre sí.                                   │
│  NO es citable. Es el mapa de dónde mirar.                         │
└────────────────────────────┬───────────────────────────────────────┘
                             │  urgencia 0–3 por tema
┌─ Capa 2 · PROFUNDIDAD ─────▼──── de pago, racionada ───────────────┐
│  Tavily, con el texto entero. El cupo REAL que queda, dividido     │
│  entre las semanas que faltan, repartido en proporción a lo que    │
│  el censo dijo que falta comprobar.                               │
└────────────────────────────────────────────────────────────────────┘
```

**Un tema que cuarenta medios de cinco países cuentan igual se lleva cero.** Ya
está corroborado; pagar por confirmarlo otra vez no compra nada. Ese cero es lo
que financia los temas de los que nadie más ha escrito.

## Capa 1 · El censo

| | GDELT | Google News RSS |
|---|---|---|
| Clave / cuenta | no | no |
| Cupo | no (1 petición/5 s) | no |
| Por consulta | **250 art., 213 medios, ~30 países, 10 idiomas** | ~100 notas, 40–70 medios, **un país por consulta** |
| URL real | **sí** → el texto se lee gratis | no, va cifrada |
| En producción | **ha fallado el 100 % de las veces** | ha servido en todas |

**GDELT es mejor y no ha entregado nunca.** Estrangula por IP con una dureza que
no perdona ni a un portátil ni a un runner de GitHub. Se deja como capa
preferente —cuando responde no hay color— con reintento, freno progresivo y un
cortacircuitos que lo apaga a los tres fallos, para que un GDELT caído no cueste
veinticinco segundos por tema. **El parte dice cuál de los dos sirvió**: un censo
más pobre que nadie anuncia es indistinguible de una semana sin noticias.

Si algún día GDELT responde de forma estable, el diseño mejora solo: trae la URL
real, y con ella el texto gratis.

### Cómo se mide el acuerdo

Parecido medio entre titulares del mismo idioma (Jaccard sobre palabras de cuatro
letras o más; trigramas de carácter para japonés, chino, coreano y tailandés).
**Nunca entre idiomas**: un titular en japonés y otro en francés no comparten una
palabra aunque digan lo mismo, y medirlos juntos daría «divergen» siempre — que
es el error que gastaría el presupuesto entero donde no hay nada que discutir.

**Es una señal débil y se usa como tal.** El comité de modelos lo dijo —el
parafraseo y el reescrito por SEO la rompen— y tiene razón. Por eso decide
únicamente **dónde gastar**, nunca si algo está corroborado: un umbral que se
equivoca cuesta unos créditos, no una frase falsa en el número.

### Consultas: dos herramientas, dos consultas

Un índice de noticias hace **Y lógico** con todas las palabras. La consulta larga
que quiere Tavily —«Hormuz Strait traffic volume cargo»— casa con cero titulares.
El modelo devuelve por eso un campo `terms` de tres palabras, y si tres no
encuentran nada se prueba con dos, que no cuesta.

## Capa 2 · El cupo

1. **Se le pregunta a Tavily** cuánto queda (`/usage`). La cifra propia no vale:
   el contador local marcaba 74 cuando el real era 117.
2. Se divide entre las **semanas que faltan** hasta que renueve.
3. Se descuenta lo que **cotejo y monitores** consumen de media, medido sobre
   días transcurridos —no sobre días con actividad, que inflaba la reserva a 203
   semanales con un gasto mensual de 117.
4. Lo que sale se reparte **en proporción a la urgencia** del censo.

### El reparto es una pendiente, no un escalón

El umbral estuvo en 0,22 de parecido, y **dos corridas del mismo día sobre la
misma semana dieron veredictos opuestos**: un tema midió 0,30 y se llevó cero, y
una hora después midió 0,207 y se llevó la cuota entera. La medida fluctúa lo
bastante como para que un acantilado en mitad del ruido decida al azar.

El **cero** sobrevive solo para el caso extremo —acuerdo alto **y** cinco países
**y** cuarenta medios a la vez—, porque es el único veredicto que deja un asunto
sin comprobar con dinero. Y **ningún asunto se lleva más de un cuarto de la
semana**: «nadie fuera escribió de esto» puntúa lo máximo y puede ser una
exclusiva o un desvarío de podcast.

## Probarlo sin gastar

```bash
gh workflow run glossa-reportaje.yml -R aauml/glossa -f solo_barrido=1 -f temas=6 -f hoy=2026-08-22T15:00:00Z
```

Enseña el plan entero —qué temas salen, cuántos medios los cubren, qué cuota le
toca a cada uno— sin comprar una búsqueda. **Correrlo desde el Action, no desde
el portátil**: los dos índices bloquean la IP tras unas pocas pruebas seguidas, y
desde local se miden ceros que no son del mundo.

## Lo descartado, y por qué

| | |
|---|---|
| **Gemini con búsqueda de Google** | 429: no entra en el tramo gratuito |
| **DuckDuckGo** | contesta 200 y devuelve **cero** enlaces a un robot |
| **SerpAPI** | demanda DMCA de Google, dic. 2025 — no se construye sobre eso |
| **Brave** (etapa 2) | lo que aportaría no es volumen sino un **índice que no comparte origen**; hará falta el día que se demuestre que un censo único se deja cosas |
| **Exa** (etapa 3) | semántico, 250 gratis/mes: «quién más dijo algo parecido», no censar |
| **Linkup** | 30 $/mes de entrada para una precisión que aún no sabemos si hace falta |

## Dónde vive

| Pieza | Archivo |
|---|---|
| Censo GDELT | `src/lib/gdelt.mjs` |
| Censo Google News | `src/lib/gnews.mjs` |
| Cupo y reparto | `src/lib/presupuesto.js` |
| Quien lo orquesta | `scripts/reportaje_from_supabase.mjs` |
| Esquema | `db/migrations/0042_barrido_y_cupo.sql` |
| Panel | `/admin` → cupo, mandos y reparto por tema |

## Lo que esto NO autoriza

Ni GDELT ni Google News son fuentes citables: dan **dónde mirar**. Lo que se cite
sale del texto del medio, leído y digerido con las mismas reglas de
[D-010](../DECISIONS.md) y D-018.
