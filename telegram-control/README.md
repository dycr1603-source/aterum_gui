# Aterum Telegram Control

Sidecar multiusuario de operaciones y monitoreo. No importa modulos de trading ni ejecuta ordenes; compone datos de APIs existentes y persiste cada consulta en `telegram_audit`.

## Copiloto local-first

El servicio aplica tres niveles: comandos deterministas sobre APIs existentes, FAQ local y Claude sólo para razonamiento transversal. `/ai` muestra uso local, caché, Claude, latencia y ahorro estimado. `/guide`, `/tutorial`, `/menu` y `/new` ofrecen navegación y novedades tomadas del changelog real.

Variables adicionales: `TELEGRAM_CLAUDE_MODEL`, `TELEGRAM_AI_CACHE_TTL_SECONDS`, `TELEGRAM_AI_MAX_INPUT_CHARS` y `TELEGRAM_AI_MAX_TOKENS`. La arquitectura completa está en [`../docs/telegram/copilot.md`](../docs/telegram/copilot.md).

## Fuentes reutilizadas

| Comando | Fuentes |
|---|---|
| `/status` | Dashboard state, Learning summary, latest Research y health probes |
| `/balance` | Dashboard state y `/db/stats` |
| `/positions` | Dashboard state y Learning decisions |
| `/performance` | Research summary y `/db/stats` |
| `/research` | Latest report, recommendation performance y Learning changes |
| `/learning` | Learning summary y changes summary |
| `/news`, `/context` | Intelligence summary |
| `/ai` | Métricas locales de uso y ahorro |
| `/ask` y preguntas libres | FAQ local, caché o Claude con contexto mínimo |
| `/health` | Probes existentes, MySQL, Redis, Binance y Telegram |
| `/logs` | MySQL y SQLite n8n en solo lectura |
| `/why`, `/history`, `/changes` | Stats, Research, Learning decisions/rules y post-trade |
| `/simulate` | Reporte Simulator existente, sin `force` |
| `/scan` | `scan_events` persistidos; no ejecuta Scanner |
| `/rebuild-report` | Recompone métricas existentes; no persiste Research |

## Roles

- `viewer`: consultas, explainability, historial y cambios.
- `moderator`: viewer más `/simulate`, `/scan` y `/rebuild-report`.
- `admin`: todo lo anterior y administración de usuarios con `/users`, `/role`, `/enable`, `/disable`.

Los miembros nuevos del grupo autorizado se registran como `viewer`. Los IDs configurados en `TELEGRAM_ALLOWED_USER_IDS` se promueven a `admin` durante el arranque.

## Agregar un comando

1. Agregar el handler en `commands.js` usando `ApiClient` antes de considerar SQL.
2. Registrar el comando en `telegram.js#setCommands`.
3. Agregar un boton en `MAIN_MENU` si corresponde.
4. Incorporarlo a `self-test.js`.
5. Asignarlo a `VIEWER_COMMANDS`, `MODERATOR_COMMANDS` o `ADMIN_COMMANDS`.

## Seguridad

- `TELEGRAM_CHAT_ID` limita el grupo y `telegram_users` controla identidad, rol y estado.
- No existe socket Docker dentro del contenedor.
- n8n SQLite se monta read-only.
- Los comandos moderator son operaciones analiticas read-only y no modifican trading.
- El token se entrega por entorno y nunca se versiona.
