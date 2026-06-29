# Workflows n8n

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
- [`trailing-manager-telegram-row-backup.json`](../../docs/archive/trailing-manager-telegram-row-backup.json)

Algunos snapshots historicos pueden contener configuracion sensible heredada. No deben redistribuirse sin ejecutar primero el sanitizador.
