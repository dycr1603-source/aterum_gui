# Analisis de workflows n8n

Fuente obligatoria inspeccionada:

```bash
find /tmp -name "*.json"
```

Archivos encontrados:

- `/tmp/Advanced AI Trading Bot v2 - Clean (13).json`
- `/tmp/SL Monitor (6).json`
- `/tmp/Trailing Manager (3).json`

No se encontro export JSON de `Operations Executor` en `/tmp`.

## Advanced AI Trading Bot v2 - Clean

- ID: `Cz4TfvaVAygWGRJm`
- Activo en export: `true`
- Nodos: 44
- Tipos principales: `scheduleTrigger`, `code`, `telegram`, `executeCommand`, `ssh`, `if`
- Triggers:
  - `Main Schedule`: cada 15 minutos.
  - `Daily Trigger AI`: diario a la hora configurada en el nodo.
  - `Weekly Trigger`: semanal.
- Credenciales referenciadas:
  - Telegram account.
  - SSH private key/password account.

Dependencias internas:

- `GET http://127.0.0.1:3001/db/stats`
- `POST http://127.0.0.1:3001/db/trade/open`
- `POST http://127.0.0.1:3001/db/rejection`
- `POST http://127.0.0.1:3001/db/scan`
- `GET http://127.0.0.1:3001/cb/status`
- `GET http://127.0.0.1:3001/cooldown/status`
- `POST http://127.0.0.1:3001/cooldown/set`
- `GET http://127.0.0.1:3001/intelligence/signal`
- `GET http://127.0.0.1:3001/api/simulator/policy?limit=160&hours=8&key=...`
- `POST http://127.0.0.1:3001/trade`
- `GET/POST http://127.0.0.1:5678/webhook/sl-monitor-*`
- `GET http://localhost:3000/chart?symbol=...`

Dependencias externas:

- Binance Futures REST:
  - `/fapi/v1/ticker/24hr`
  - `/fapi/v1/klines`
  - `/fapi/v1/fundingRate`
  - `/fapi/v1/openInterest`
  - `/fapi/v1/premiumIndex`
- Anthropic Messages API.
- Alternative.me Fear and Greed API.
- Telegram Bot API via nodo n8n.

Variables/secretos esperados:

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `ANTHROPIC_API_KEY`
- Telegram credential/chat target.
- Base interna dashboard `http://127.0.0.1:3001`.
- Base interna n8n `http://127.0.0.1:5678`.
- Policy key `aterum_policy_v1`.

Tablas/entidades implicadas:

- `trades`
- `trade_rejections`
- `scan_events`
- vistas/consultas de stats expuestas por `/db/stats`
- estado runtime de `cooldown` y `circuit_breaker`

## SL Monitor

- ID: `ZYhtV8yWXjNukrW4`
- Activo en export: `true`
- Nodos: 12
- Tipos principales: `scheduleTrigger`, `webhook`, `code`, `if`, `telegram`
- Trigger programado: cada 10 segundos.
- Webhooks:
  - `GET /webhook/sl-monitor-get`
  - `POST /webhook/sl-monitor-set`
  - `POST /webhook/sl-monitor-reset`
- Credenciales referenciadas:
  - Telegram account.

Dependencias internas:

- `POST http://127.0.0.1:3001/db/trade/close`
- `POST http://127.0.0.1:3001/db/trade/update-sl`
- `POST http://127.0.0.1:3001/cb/sl`
- `POST http://127.0.0.1:3001/cb/tp`
- `POST http://127.0.0.1:3001/cooldown/set`
- `GET http://127.0.0.1:3001/db/stats`
- `POST http://127.0.0.1:3001/db/post-trade`
- `DELETE http://127.0.0.1:3001/trade/:symbol`

Dependencias externas:

- Binance Futures REST para posiciones, ordenes y precios.
- Anthropic Messages API para analisis post-trade.
- Telegram Bot API.

Tablas/entidades implicadas:

- `trades`
- `trade_closes`
- `circuit_breaker`
- `post_trade_analysis`
- estado runtime `activeTrades`
- estado runtime `symbolCooldowns`

## Trailing Manager

- ID: `q32UEjoj5wNiBHil`
- Activo en export: `true`
- Nodos: 4
- Tipos principales: `scheduleTrigger`, `code`, `if`, `telegram`
- Trigger programado: cada 1 minuto.
- Credenciales referenciadas:
  - Telegram account.

Dependencias internas:

- `GET http://127.0.0.1:5678/webhook/sl-monitor-get`
- `POST http://127.0.0.1:5678/webhook/sl-monitor-set`
- `POST http://127.0.0.1:3001/db/trade/update-sl`
- `POST http://127.0.0.1:3001/trade`

Dependencias externas:

- Binance Futures REST:
  - price/klines/exchangeInfo
  - endpoints autenticados para modificar stops, segun estado del trade.
- Telegram Bot API.

Tablas/entidades implicadas:

- `trades` via `/db/trade/update-sl`
- estado runtime del SL Monitor via webhooks.

## Observaciones globales

- Los workflows son la fuente de verdad para los contratos HTTP internos.
- El export de `Operations Executor` no esta disponible en `/tmp`; por tanto no pudo importarse ni validarse directamente.
- Los exports contienen secretos reales o con formato real. Deben rotarse antes de operar.
- No se ejecutaron pruebas que envien ordenes reales a Binance.
