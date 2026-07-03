# Workflows n8n

La ruta única `Execute Trade` genera `OPEN_POSITION` para el Execution Engine. El motor abre, crea SL/TP y relee Binance; sólo una respuesta `VERIFIED` continúa hacia estado local, persistencia y Telegram. SL Monitor y Trailing Manager generan solicitudes verificadas y no llaman endpoints de mutación Binance directamente.

El pipeline V2 usa `Opportunity Discovery` y `Deterministic Entry Gate`. El scoring generativo/visual y la rama duplicada de ejecución fueron retirados del entry. Daily y Weekly Research continúan fuera de la decisión operativa.

## Snapshot actual

Los JSON en [`current/`](./current/) son exportaciones sanitizadas y se guardan con `active=false` para que una importacion no opere accidentalmente. El inventario conserva el estado que tenian al exportarse, junto con nombre, id, cantidad de nodos y SHA-256.

Workflows esperados:

- Advanced AI Trading Bot v2 - Clean
- SL Monitor
- Trailing Manager
- Recommendation Review Engine
- Telemetry Persistence Test
- Telemetry Persistence Webhook

Las credenciales no se incluyen. Despues de importar deben reasignarse Telegram, Binance, Anthropic y cualquier credencial propia de n8n.

## Historial existente

Los snapshots historicos operativos se conservan fuera del repositorio en `/home/docs`; el backup Telegram versionado está en `docs/archive`:

- [`main-active.before-research-learning.json`](/home/docs/main-active.before-research-learning.json)
- [`main-active.before-trading-logic.json`](/home/docs/main-active.before-trading-logic.json)
- [`main-before-claude-ssh-fix.json`](/home/docs/main-before-claude-ssh-fix.json)
- [`recommendation-review.before-research-learning.json`](/home/docs/recommendation-review.before-research-learning.json)
- [`sl-active.before-trading-logic.json`](/home/docs/sl-active.before-trading-logic.json)
- [`main-active.before-decision-pipeline-v2-20260630.json`](/home/docs/main-active.before-decision-pipeline-v2-20260630.json)
- [`trailing-manager-telegram-row-backup.json`](../../docs/archive/trailing-manager-telegram-row-backup.json)

Algunos snapshots historicos pueden contener configuracion sensible heredada. No deben redistribuirse sin ejecutar primero el sanitizador.
