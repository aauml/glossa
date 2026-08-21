# Estado de producción — auditoría del 2026-08-20/21

**Todo lo de la auditoría está aplicado y verificado en producción.** Este archivo
queda como registro de qué se tocó y qué decisiones siguen abiertas.

## Aplicado el 2026-08-21

| Paso | Estado |
|---|---|
| Token `Glossa - publish token` en 1Password (bóveda `ademas.ai`, campo `credential`) | ✅ creado por Arturo |
| Secreto `GLOSSA_PUBLISH_TOKEN` en las edge functions de Supabase | ✅ HTTP 201 |
| Secreto `SUPABASE_SERVICE_KEY` en GitHub (`Supabase thesis` → campo `secret-key`) | ✅ |
| `glossa-enqueue` y `glossa-research-enqueue` redesplegadas con la compuerta | ✅ |
| Migraciones 0006 y 0007 | ✅ aplicadas |
| Fusión a `main` y despliegue en Vercel | ✅ |
| Prueba de extremo a extremo (cabecera) | ✅ POST → URL en vivo en 20 s |
| Prueba de extremo a extremo (token en el cuerpo, sin cabecera) | ✅ POST → URL en vivo en 30 s |

### Lo que se probó, y lo que dio

- POST sin cabecera → **401**. Con token incorrecto → **401**.
- `slug: "../../../.github/workflows/pwn"` → **400**, no escribe nada.
- `issue_no: 'N° 1"; touch /tmp/pwned; #'` → **400**, no llega al `git commit`.
- Publicación real de una pieza oculta, por las dos vías: `queued → building → done`
  en 20–30 s, con `url_en` y `commit_sha` escritos de vuelta. Mensaje de commit limpio.
  Ambas retiradas después.
- Cuerpo con MDX inválido (sin frontmatter): el build lo rechaza, **no se commitea nada**,
  la fila queda en `error` y el sitio no se toca. La validación previa al commit funciona.
- Cuerpo no-JSON → **400**, sin tocar la base.
- Nota: Cloudflare, delante de Supabase, bloquea con **403** los cuerpos que contienen
  firmas conocidas como `etc/passwd` antes de llegar a la función. Es una capa extra,
  no sustituye la validación: `../../../.github/workflows/…` sí llega, y lo para el 400.
- `anon` ya no puede hacer UPDATE en las colas (era el fallo del 2026-07-01);
  `secret-key` y `service-role-key` sí.

## Cómo publicar desde el chat ahora

Igual que antes, más una cabecera:

```
POST https://wtwuvrtmadnlezkbesqp.supabase.co/functions/v1/glossa-enqueue
Content-Type: application/json
x-glossa-token: <1Password → ademas.ai → "Glossa - publish token" → credential>
```

**Si tu superficie no deja fijar cabeceras**, manda el mismo valor como campo `"token"`
del cuerpo JSON. Las dos vías están probadas de extremo a extremo y son equivalentes; la
cabecera es preferible porque los cuerpos acaban en más registros. Así no depende de lo
que el conector del móvil permita.

## Decisiones abiertas

- **Rol de las escrituras de procedencia.** La 0007 concede INSERT en
  `glossa_issue_targets` y UPDATE en `glossa_issues` a `authenticated`, no a `anon`.
  Si el conector del chat es anon, la salida NO es abrir anon: es llevar esas
  escrituras al payload de `glossa-enqueue`, que ya corre con service key tras el token.
- **Backfill de procedencia.** 41 de 45 piezas no tienen fila en `glossa_issues`; 41 no
  tienen `sources.json`. O se rellenan, o se declara que la procedencia empieza en N° 32.
- **Exhibits interactivos.** Los cuatro compilan contra React 19 / recharts 3 (probado
  con una página temporal), pero ningún artículo los importa, así que el build no los
  protege. O se usan, o se retiran con react, react-dom y recharts.
- **`glossa_issues.model`.** Se escribe solo si el workflow declara `GLOSSA_MODEL`.
  Decidir si se puebla o se retira la columna.
- **`sortDate` empatados.** 16 piezas comparten hora, así que su orden relativo en la
  portada es arbitrario (estable, pero no intencionado). `npm run check` lo avisa.
  Se arregla dando horas distintas cuando importe el orden.
