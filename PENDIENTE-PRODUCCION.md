# Pasos de producción pendientes — rama `hardening-y-limpieza`

El código está hecho y el build pasa. Lo que queda toca producción y **no** se ha
ejecutado. El orden importa: los pasos 1–4 van juntos o la publicación desde chat
queda rota (que es como está hoy, desde el 2026-07-01).

## 1. Crear el token (1Password) — ÚNICO paso manual
Bóveda `ademas.ai`, item nuevo de tipo **API Credential** (como el resto de la bóveda),
título exacto **`Glossa - publish token`**, campo **`credential`** con una contraseña
generada larga. El `op` de esta máquina es de solo lectura: no puede crear items.

## 2. Secreto de las edge functions (Supabase)
En el proyecto `wtwuvrtmadnlezkbesqp`, secreto `GLOSSA_PUBLISH_TOKEN` con ese valor.
Luego desplegar las dos funciones con `verify_jwt=false` (siguen sin JWT; la compuerta
es la cabecera):

    supabase functions deploy glossa-enqueue        --no-verify-jwt
    supabase functions deploy glossa-research-enqueue --no-verify-jwt

## 3. Secreto del repo (GitHub)
`SUPABASE_SERVICE_KEY` en los secrets de `aauml/glossa`, con el valor del item
`Supabase thesis` campo **`secret-key`** (`sb_secret_…`). Ojo: el campo `credential` de
ese item está VACÍO, y `anon-key` da 401 en UPDATE — es la causa exacta del fallo del
2026-07-01. Verificado el 2026-08-20: `secret-key` y `service-role-key` responden 204 a
un UPDATE; `anon-key`, 401. Los dos workflows ya esperan la variable. `TAVILY_API_KEY` ya está.

## 4. Migraciones
Aplicar `db/migrations/0006` y `0007` al proyecto `wtwuvrtmadnlezkbesqp`.
Son aditivas e idempotentes; 0007 solo quita permisos y políticas redundantes.
Comprobar antes que `glossa_candidates` conserva su UPDATE (lo usa el dashboard
de la tesis, no Glossa).

## 5. Fusionar a `main`
Cada push a `main` despliega en Vercel. El build está verificado en local:
90 páginas, sitemap, dos feeds, portada ES.

## 6. Prueba de extremo a extremo
- POST a `glossa-enqueue` **sin** cabecera → 401.
- POST con `slug: "../../evil"` → 400.
- POST real de una pieza de prueba → `queued → building → done`, con `url_en` escrita.
  Borrar la pieza después.

## Decisiones que quedan abiertas (no las tomé yo)

- **Rol de las escrituras de procedencia.** 0007 concede INSERT en
  `glossa_issue_targets` y UPDATE en `glossa_issues` a `authenticated`, no a `anon`.
  Si el conector del chat resulta ser anon, la salida no es abrir anon (sería
  reabrir el agujero): es llevar esas escrituras al payload de `glossa-enqueue`.
- **Backfill de procedencia.** 41 de 45 piezas no tienen fila en `glossa_issues`
  y 41 no tienen `sources.json`. O se rellenan, o se declara que la procedencia
  empieza en N° 32 y lo anterior es archivo.
- **Exhibits interactivos.** Los cuatro compilan contra React 19 / recharts 3, pero
  ningún artículo los importa, así que el build no los protege. O se usan, o se
  retiran junto con react, react-dom y recharts.
- **`glossa_issues.model`.** Ahora se escribe solo si el workflow declara
  `GLOSSA_MODEL`. Decidir si se puebla o se retira la columna.
- **Prefijo `N°` vs `N.º`.** Normalizado: EN usa `N°`, ES usa `N.º`.
