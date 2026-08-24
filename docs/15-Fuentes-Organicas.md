# 15 · Fuentes orgánicas

Las cuarenta fuentes las dio de alta Arturo a mano, y esa lista era una foto:
buena el día que se tomó, más vieja cada semana. Este documento describe cómo el
directorio se **ramifica desde el material mismo** — y por qué el que decide es
el consejo, no el radar y no Arturo.

## De dónde nacen los candidatos

Dos viveros, los dos ya existían y tiraban la evidencia:

1. **Las menciones.** El análisis de cada episodio ya detectaba cuándo un
   hablante cita a alguien como *su* fuente de información («as Hudson showed»,
   «the FT reported»). Desde la 0044 esas citas se guardan en
   `glossa_radar_menciones`: es el grafo de quién-cita-a-quién. Nombrar a alguien
   para atacarlo o de pasada no es una mención; la procedencia sí.
2. **El reportaje.** La salida del viernes ya encontraba medios que entregan
   texto útil sobre un tema. Ahora cada medio que **entra** al número queda
   anotado en el expediente (`glossa_radar_candidatos`), con la semana y el tema.

## El ciclo de vida

```
candidato ──(consejo)──▶ a_prueba ──(consejo)──▶ confianza
    │                        │
  vetado ◀──(Arturo)──── degradado
```

- **Candidato**: alcanzó el umbral — lo citan ≥2 fuentes *distintas*
  (`candidato_menciones_minimas`), o el reportaje lo encontró en ≥2 semanas
  (`candidato_semanas_reportaje`). Exigir fuentes distintas es deliberado: dos
  menciones del mismo canal son una voz con eco, no dos voces.
- **A prueba**: el comité del domingo votó el alta. Se le descubre el RSS
  (autodescubrimiento: el `<link>` del HTML o los caminos de siempre), entra en
  `glossa_radar_sources` con `estado='a_prueba'` y `temas` acotados, y el radar
  la sondea como a cualquiera. Pero su material va **etiquetado**: el prompt del
  número tiene prohibido usarlo como corroboración — informa, no confirma.
- **Confianza**: tras `prueba_semanas_minimas` semanas, el comité revisa su
  historial de cotejo — ¿sus afirmaciones se sostuvieron? ¿aportó relatos
  *distintos* de los que ya había? — y vota `confianza`, `degradar` o `seguir`.
  La confianza es **por tema**, no en general.
- **Vetado**: la única palabra humana del ciclo. Arturo no aprueba altas ni las
  ordena — para eso está el comité —, pero puede vetar a cualquiera desde el
  panel, y el veto apaga la fuente si ya estaba de alta. Un candidato vetado no
  acumula expediente.

## Quién decide, y por qué así

El comité es el mismo del consejo (D-038 de thesis, migración 0025): tres casas
que **no** son Gemini, porque Gemini es quien analiza y quien analiza no vota
sobre qué analizará. Cada deliberación queda en `glossa_radar_consejo` con la
ranura `fuentes_organicas`: qué evidencia vio, quién votó qué, y el motivo.

## La cámara de eco se mide, no se clasifica

Pedirle a un modelo que etiquete ideologías es frágil y falla justo en los casos
importantes. Lo que sí se puede medir sin opinar es **estructura**:

- El umbral de entrada exige citas de fuentes *distintas*.
- La pregunta al comité lleva la lista de **quiénes** citan al candidato, con la
  instrucción explícita: si todos los que lo citan son un mismo racimo, las
  menciones miden alineación, no alcance — y eso es motivo de rechazo.
- Lo que gana la confianza no es coincidir sino **aportar**: el veredicto de la
  prueba premia hechos que sobrevivieron al cotejo y relatos distintos de los que
  ya había, y castiga la redundancia — repetir lo que los padrinos ya decían no
  renueva la audición, la termina.

El periodista que es fuente directa y no se puede corroborar no se excluye: se
**etiqueta** (afirmado, con su nombre) y acumula historial. Si lo que afirmó en
solitario aparece documentado semanas después, ese historial es lo que el comité
pesa. Así es como se gana ser fuente de confianza: por expediente, no por fama.

## Los frenos

| Ajuste | Valor | Por qué existe |
|---|---|---|
| `fuentes_altas_por_semana` | 2 | cada fuente cuesta cuota de Gemini a diario; un domingo entusiasta no puede duplicar el gasto |
| `fuentes_tope_por_tema` | 6 | fuentes orgánicas activas por tema; con el cupo lleno no se convoca al comité |
| `candidato_menciones_minimas` | 2 | fuentes distintas, no menciones totales |
| `candidato_semanas_reportaje` | 2 | encontrar a un medio una semana es suerte; dos es señal |
| `prueba_semanas_minimas` | 3 | antes no hay muestra que juzgar |

Los topes cuentan solo las fuentes **orgánicas** (las que tienen `candidato_id`):
las cuarenta de Arturo son el ancla y no compiten por cupo.

## Dónde vive cada cosa

| Pieza | Dónde |
|---|---|
| Extraer menciones | `promptDigest` en `supabase/functions/_shared/prompts.ts` |
| Guardarlas | `glossa-radar-run` → `glossa_radar_menciones` |
| Anotar medios del reportaje | `scripts/reportaje_from_supabase.mjs` → `glossa_radar_candidatos` |
| Expedientes agregados | RPC `glossa_radar_expedientes()` |
| Altas y veredictos | `scripts/consejo_from_supabase.mjs`, fase 2 (domingo) |
| Etiquetar lo a prueba en el número | `scripts/weekly_from_supabase.mjs` (`probation: true`) |
| Mirar y vetar | `/admin`, sección «Growing on its own» |
| Esquema | `db/migrations/0044_fuentes_organicas.sql` |

## Qué genera y quién lo lee

Exigido por `STANDARD-PUBLISHED-OUTPUT`: los expedientes los lee **el consejo**
(decide con ellos cada domingo) y los lee **Arturo** en el panel (única vista, y
único lugar del veto). El número lee las etiquetas `probation` para no fabricar
corroboración. Si el consejo dejara de correr, habría que retirar también la
recolección de menciones — un expediente que nadie juzga es la fila de la tabla
de la sección homónima del CLAUDE.md: salida sin consumidor.

## Lo que esto NO hace

- No rastrea directorios de medios ni indexa listas externas: eso pide cuota y
  suscripciones que no hay. El crecimiento es incremental y guiado por el uso.
- No sigue personas sin feed. Un académico citado queda en el vivero con su
  expediente a la vista; si tiene Substack o podcast, el autodescubrimiento lo
  encuentra y entonces sí puede ser alta. Seguir a una persona *como consulta*
  (sin feed) es trabajo de los monitores, no del radar.
- No deroga ninguna compuerta existente: el material orgánico pasa por el mismo
  cotejo, el mismo reportaje y el mismo número que todo lo demás.
