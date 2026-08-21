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
| Prueba de extremo a extremo | ✅ POST → URL en vivo en 20 s |

### Lo que se probó, y lo que dio

- POST sin cabecera → **401**. Con token incorrecto → **401**.
- `slug: "../../../.github/workflows/pwn"` → **400**, no escribe nada.
- `issue_no: 'N° 1"; touch /tmp/pwned; #'` → **400**, no llega al `git commit`.
- Publicación real de una pieza oculta: `queued → building → done` en 20 s, con
  `url_en` y `commit_sha` escritos de vuelta. Mensaje de commit limpio. Retirada después.
- `anon` ya no puede hacer UPDATE en las colas (era el fallo del 2026-07-01);
  `secret-key` y `service-role-key` sí.

## Cómo publicar desde el chat ahora

Igual que antes, más una cabecera:

```
POST https://wtwuvrtmadnlezkbesqp.supabase.co/functions/v1/glossa-enqueue
Content-Type: application/json
x-glossa-token: <1Password → ademas.ai → "Glossa - publish token" → credential>
```

**Pendiente de comprobar en el móvil:** si el conector de claude.ai puede mandar una
cabecera fija. Si no puede, la alternativa es exigir un JWT de usuario autenticado de
Supabase en vez de un token propio — pero eso depende de si hay usuarios en Supabase Auth.

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
