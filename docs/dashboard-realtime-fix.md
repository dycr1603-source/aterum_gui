# Dashboard Realtime Fix

Fecha: 2026-06-23 UTC

## Problema

`/dashboard` mostraba datos atrasados o con delay.

## Causa

El backend recalculaba `accountState.totalUnreal` periódicamente, pero esa actualización se enviaba sólo a clientes SSE. La pantalla `/dashboard` usa WebSocket `/ws?channel=account`, por lo que recibía updates frescos sólo en snapshots completos o eventos de cuenta.

Además, la GUI usaba polling lento:

- trades: 5s
- cuenta: 300s
- klines: 300s
- PnL UI: 1s

## Cambios

Backend:

- `/home/aterum_gui/routes/account.js`
- `updateUnrealized()` ahora llama a `shared.broadcastAccount()`.
- Fanout WebSocket/SSE de cuenta cada 1s.
- Snapshot completo Binance cada 15s.

Frontend:

- `/home/aterum_gui/views/dashboard.js`
- `/dashboard` hidrata la operación visible directamente desde snapshots WebSocket.
- Refresca trades cuando cambia la estructura de posiciones.
- Polling ajustado:
  - klines: 60s
  - trades: 1.5s
  - PnL UI: 0.5s
  - account fallback: 30s
  - daily stats: 30s

## Validación

WebSocket local:

```text
n=1 tsAgeMs=643
n=2 tsAgeMs=0
n=3 tsAgeMs=1
```

WebSocket por IP pública:

```text
ws://15.229.49.86:3001/ws?channel=account
tsAgeMs=411
positions=1
```

Servicios:

- dashboard healthy
- aterum_gui healthy
- mysql healthy
- redis healthy
- n8n up
- nginx up

No se modificó lógica de trading ni se ejecutaron órdenes.
