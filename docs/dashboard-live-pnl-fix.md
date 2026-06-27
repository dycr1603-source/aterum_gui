# Dashboard Live PnL Fix

Fecha: 2026-06-23 UTC

## Problema

El PnL en vivo del dashboard no se actualizaba correctamente.

## Causa

Se detectaron tres problemas:

1. El frontend recalculaba PnL con `lastPrice` del gráfico aunque Binance ya enviaba `unrealized`.
2. `/trades` devolvía posiciones abiertas del workflow sin mezclar `markPrice` y `unrealized` reales desde `accountState`.
3. El backend usaba `/fapi/v1/ticker/price` para refrescar PnL, pero para futures corresponde usar mark price.

## Cambios

Backend:

- `/home/aterum_gui/routes/account.js`
  - `updateUnrealized()` ahora usa:
    - `/fapi/v1/premiumIndex?symbol=...`
    - campo `markPrice`
  - PnL mantiene 8 decimales internamente.

- `/home/aterum_gui/routes/trades.js`
  - Las posiciones del workflow ahora se enriquecen con:
    - `markPrice`
    - `unrealized`
    - `hasSL`
    - `hasTP`
    - `liveSyncedAt`

Frontend:

- `/home/aterum_gui/views/dashboard.js`
  - `updatePnL()` usa `currentTrade.unrealized` como fuente principal cuando existe.
  - El cálculo local queda sólo como fallback.

## Validación

Ejemplo posterior al fix:

```text
account.totalUnreal = 0.24
ETHUSDT unrealized = -0.204
BTCUSDT unrealized = 0.444
```

`/trades` devuelve:

```text
BTCUSDT markPrice=62373.8 unrealized=0.444
ETHUSDT markPrice=1657.03 unrealized=-0.204
```

Servicios:

- dashboard healthy
- aterum_gui healthy
- n8n up
- mysql healthy
- redis healthy
- nginx up

No se modificó lógica de trading ni se ejecutaron órdenes.

## Nota Operativa

El disco raíz sigue crítico:

```text
/dev/nvme0n1p1  99% usado, ~118 MB libres
```

Se recomienda ampliar disco o mover Docker data root antes de nuevas reconstrucciones.
