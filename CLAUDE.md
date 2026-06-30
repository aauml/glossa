# Glossa — CLAUDE.md

Guía para Claude al trabajar en este proyecto. El diseño completo está en [`/docs`](docs/).

## 1Password — Acceso a secretos (ya configurado, headless)

`op` (1Password CLI) ya está autenticado de forma global con el service account `claude-code-sandbox` vía `~/.zshenv` (token de solo lectura, en todas las sesiones). No hay que hacer login ni abrir la app de 1Password. Verifícalo: `op whoami` → User Type: SERVICE_ACCOUNT.

Todos los secretos viven en una sola bóveda: `ademas.ai`, organizados por nombre (ej.: `Radius - OpenAI API Key`, `Radius - Neon DATABASE_URL`, `Supabase thesis`).

Leer un secreto (úsalo directo en variable, NO lo imprimas en el chat):

```bash
KEY=$(op item get "Radius - OpenAI API Key" --vault ademas.ai --fields credential --reveal)
```

Ver los campos de un item: `op item get "NOMBRE" --vault ademas.ai --format json`

Listar/buscar items: `op item list --vault ademas.ai`

Es solo lectura (no escribe/edita). Si una sesión vieja pide el master password, ciérrala y abre una nueva (o `exec zsh`) para que tome el token de `~/.zshenv`.
