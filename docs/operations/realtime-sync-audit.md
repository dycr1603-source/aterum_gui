# Realtime Sync Audit

Fecha: 2026-06-24 UTC

## Problema detectado

El dashboard mezclaba varias fuentes con intervalos independientes:

- WebSocket de cuenta.
- WebSocket/SSE de precio.
- `/trades` cada 1.5 s.
- `/api/account` cada 30 s.
- `/db/stats` cada 30 s.
- `/api/all-prices` dentro de `loadTrades`.

Esto podía producir estados incoherentes: PnL nuevo con estadísticas viejas, posición nueva con SL/TP de otra lectura, o widgets con timestamps distintos.

## Corrección aplicada

Se añadió `GET /api/dashboard/state`.

El endpoint devuelve un snapshot único:

- `account`: estado vivo de Binance mantenido por el backend.
- `trades.active` y `trades.closed`: trades workflow/MySQL fusionados con mark price y PnL vivo.
- `prices`: precios usados por watchlist.
- `stats`: PnL diario, ROI diario, margen.
- `sources`: timestamps de cuenta, trades y stats.

La pantalla `/dashboard` ahora usa `loadDashboardState()` como refresco central cada 1.5 s. Se mantienen los streams de precio/cuenta para fluidez visual, pero el refresco coherente de widgets sale del snapshot central.

## Validación

Endpoint:

- `http://127.0.0.1:3001/api/dashboard/state`: HTTP 200.

Snapshot final:

- `snapshotTs`: 1782261688125
- `accountTs`: 1782261687878
- diferencia aproximada: 247 ms

Posiciones activas en snapshot:

- BTCUSDT:
  - entry: 62521.8
  - SL visual/workflow: 63133.6
  - TP: 61266.8
  - mark: 62955.30275362
  - unrealized: -1.30050826
- ETHUSDT:
  - entry: 1654.99
  - SL visual/workflow: 1677.3
  - TP: 1610.8
  - mark: 1670.94582946
  - unrealized: -1.59558295

Nota: Binance no devolvía órdenes SL abiertas en ese instante (`sl=null` en account positions), pero el dashboard conserva el SL de workflow/MySQL para visualización, evitando la regresión del SL visual.
