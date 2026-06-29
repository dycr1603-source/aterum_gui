# Dashboard Data Consistency

Fecha: 2026-06-24 UTC

## Flujo validado

Binance -> Dashboard API -> MySQL/workflow state -> `/api/dashboard/state` -> GUI.

## Endpoints finales

- Dashboard health: `http://127.0.0.1:3001/healthz` -> HTTP 200.
- Dashboard snapshot: `http://127.0.0.1:3001/api/dashboard/state` -> HTTP 200.
- n8n host: `http://127.0.0.1:5678/n8n/` -> HTTP 200.
- n8n nginx: `http://127.0.0.1/n8n/` -> HTTP 200.
- n8n público actual: `http://15.228.159.246/n8n/` -> HTTP 200.
- Dashboard público actual: `http://15.228.159.246/dashboard` -> HTTP 200.
- Dashboard snapshot público actual: `http://15.228.159.246/api/dashboard/state` -> HTTP 200.

## MySQL

Trades abiertos:

- BTCUSDT:
  - status: OPEN
  - entry_price: 62521.9000000000
  - sl_price: 63133.6000000000
  - tp_price: 61266.8000000000
  - qty: 0.0030000000
- ETHUSDT:
  - status: OPEN
  - entry_price: 1655.0000000000
  - sl_price: 1677.3000000000
  - tp_price: 1610.8000000000
  - qty: 0.1000000000

Trade closes:

- total: 12
- total_pnl: 6.34
- last_close: 2026-06-23 15:29:21

## API/Dashboard Snapshot

Account:

- balance: 212.12918505
- equity: 209.23309384
- available: 116.66589176
- totalMargin: 95.46329329
- totalUnreal: -2.89609121
- openPositions: 2

Trades activos:

- BTCUSDT:
  - entry: 62521.8
  - SL: 63133.6
  - TP: 61266.8
  - mark: 62955.30275362
  - unrealized: -1.30050826
- ETHUSDT:
  - entry: 1654.99
  - SL: 1677.3
  - TP: 1610.8
  - mark: 1670.94582946
  - unrealized: -1.59558295

## Conclusión

El dashboard ya no depende de polling separado por widget para su estado principal. La fuente coherente es `/api/dashboard/state`, que fusiona Binance live account con trades workflow/MySQL y mantiene SL/TP visuales del sistema aunque Binance no devuelva una orden SL abierta en el momento de lectura.
