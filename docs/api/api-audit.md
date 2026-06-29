# API Audit

Fecha: 2026-06-22 05:40 UTC

## Endpoints principales

| Endpoint | Estado | Origen de datos | Tablas / servicios |
| --- | --- | --- | --- |
| `/healthz` | OK | Proceso dashboard | N/A |
| `/api/account` | OK | Binance Futures account + estado backend | Binance `/fapi/v2/account`, `/fapi/v2/positionRisk`, open orders |
| `/api/account/stream` | OK | SSE de `accountState` | Binance vía backend |
| `/db/stats` | OK | MySQL | `daily_pnl`, `symbol_performance`, `trades`, `trade_closes`, `trade_rejections` |
| `/trades` | OK | Estado vivo + MySQL fallback | `/data/trades.json`, Binance accountState, `trades`, `trade_closes` |
| `/api/all-prices` | OK | Binance prices | Binance market data |
| `/api/klines` | OK | Binance klines | Binance market data |
| `/api/intelligence/summary` | OK | MySQL + Binance account + news/session engine | `trades`, `trade_closes`, accountState |
| `/db/ai-data` | OK | MySQL | `trades`, `trade_rejections`, `post_trade_analysis` |
| `/api/simulator/report` | OK | n8n SQLite + MySQL | n8n execution DB, `trades`, `trade_closes` |
| `/api/simulator/policy` | OK | Backend simulator policy | local policy/env |
| `/cb/status` | OK | Backend state + MySQL events | `circuit_breaker` |
| `/cooldown/status` | OK | Backend memory | `symbolCooldowns` |

## Respuestas actuales relevantes

### `/api/account`

Valores actuales confirmados:

- `balance`: `208.95074855`
- `equity`: `207.33274855`
- `available`: `76.67212402`
- `totalMargin`: `132.27862453`
- `totalUnreal`: `-1.618`
- `openPositions`: `3`
- posiciones: `ZECUSDT SHORT`, `HYPEUSDT SHORT`, `SOLUSDT LONG`

Antes de la corrección este endpoint devolvía todos los importes en `0` y `positions: {}`.

### `/trades`

Valores actuales confirmados:

- `active`: `SOLUSDT`, `HYPEUSDT`, `ZECUSDT`, fuente `WORKFLOW`.
- `closed`: `ETHUSDT`, `ZECUSDT`, `SOLUSDT`, fuente `MYSQL`.

Antes de la corrección, después de reiniciar dashboard, `closed` podía quedar `{}` aunque MySQL tuviera cierres.

### `/db/stats`

Valores actuales confirmados:

- daily 2026-06-22: `trades=3`, `wins=1`, `losses=2`, `pnl=1.82`, `win_rate=33.3`.
- símbolos: `SOLUSDT +7.58`, `ETHUSDT -2.51`, `ZECUSDT -3.25`.
- recent: 6 trades, 3 `OPEN`, 3 `CLOSED`.

### `/api/simulator/report`

Valores actuales confirmados:

- `total`: 12 señales desde n8n.
- `opened`: 6.
- `rejected`: 6.
- `actual.summary`: 3 cierres reales, win rate `33.3`, PnL `1.82`.

### `/api/intelligence/summary`

Valores actuales confirmados:

- `performance.overall.tradeCount`: 3.
- `positions.openPositions`: 3.
- incluye posiciones reales y PnL flotante desde `/api/account`.

## Rutas 404 verificadas

Estas rutas no existen en el backend actual y no son consumidas por la GUI:

- `/api/stats`
- `/api/trades`
- `/api/positions`
- `/api/analytics`

Los equivalentes reales ya están documentados en `schema-gap-analysis.md`.
