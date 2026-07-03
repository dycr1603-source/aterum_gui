# Environment

## Position Guard

| Variable | Default | Uso |
| --- | --- | --- |
| `POSITION_GUARD_BINANCE_API_KEY` | obligatorio | Clave Futures aislada para verificación y protección. |
| `POSITION_GUARD_BINANCE_API_SECRET` | obligatorio | Firma HMAC del guardia. |
| `POSITION_GUARD_ENFORCE` | `false` | Controla sólo el cierre de emergencia por ausencia prolongada de STOP. |
| `POSITION_GUARD_POLL_MS` | `5000` | Frecuencia de auditoria de protección. |
| `POSITION_GUARD_UNPROTECTED_GRACE_MS` | `60000` | Espera antes de cerrar una posición que continúa sin STOP. |
| `POSITION_GUARD_HEALTH_MS` | `60000` | Frecuencia de health completo. |
| `EXECUTION_ENGINE_TOKEN` | obligatorio | Bearer compartido con n8n para autorizar mutaciones. |

Las claves no se documentan ni se exponen en puertos públicos.

## Telegram Copilot

| Variable | Default | Uso |
| --- | --- | --- |
| `TELEGRAM_CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Modelo usado solo por preguntas de razonamiento. |
| `TELEGRAM_ANTHROPIC_API_KEY` | sin default | Credencial aislada del Copiloto; tiene precedencia sobre la global. |
| `TELEGRAM_AI_CACHE_TTL_SECONDS` | `300` | Vigencia de respuestas identicas. |
| `TELEGRAM_AI_MAX_INPUT_CHARS` | `3000` | Limite de contexto enviado. |
| `TELEGRAM_AI_MAX_TOKENS` | `400` | Limite de salida. |

`ANTHROPIC_API_KEY` debe contener una clave valida; un placeholder mantiene los niveles locales y deshabilita explicitamente el nivel Claude.

## Fuente de verdad

```env
APP_DOMAIN=aterum.duckdns.org
```

Compose deriva y exporta automaticamente:

```env
APP_URL=https://aterum.duckdns.org
API_URL=https://aterum.duckdns.org/api
GUI_URL=https://aterum.duckdns.org
N8N_URL=https://aterum.duckdns.org/n8n
```

## n8n publico derivado

```env
N8N_HOST=aterum.duckdns.org
N8N_PROTOCOL=https
WEBHOOK_URL=https://aterum.duckdns.org/
N8N_EDITOR_BASE_URL=https://aterum.duckdns.org/n8n/
N8N_PROXY_HOPS=1
N8N_SECURE_COOKIE=true
```

`N8N_HOST`, `WEBHOOK_URL` y `N8N_EDITOR_BASE_URL` no se duplican en `.env`; Compose los construye desde `APP_DOMAIN`.

## URLs internas

```env
INTERNAL_DASHBOARD_BASE=http://127.0.0.1:3001
INTERNAL_N8N_BASE=http://127.0.0.1:5678
EXECUTION_ENGINE_URL=http://position_guard:3091/executions
EXECUTION_ENGINE_TOKEN=<secreto interno largo>
```

Las URLs internas no deben convertirse a HTTPS ni al dominio publico: n8n, Dashboard y Chart API comparten namespace de red para preservar los workflows historicos.

`EXECUTION_ENGINE_TOKEN` debe ser idéntico en n8n y `position_guard`. El endpoint no se publica por nginx; el token sigue siendo obligatorio para impedir mutaciones accidentales desde otros contenedores.

No versionar `/home/.env`. Usar `.env.example` sin secretos.

## Telegram Control

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ALLOWED_CHAT_IDS=
TELEGRAM_ALLOWED_USER_IDS=
```

El token reutiliza el mismo bot de notificaciones n8n. `TELEGRAM_ALLOWED_CHAT_IDS` limita grupos; `TELEGRAM_ALLOWED_USER_IDS` siembra admins. El resto de miembros se administra en `telegram_users`.
