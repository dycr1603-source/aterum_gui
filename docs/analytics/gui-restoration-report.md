# GUI Restoration Report

Fecha: 2026-06-22 05:40 UTC

## Problema confirmado

La GUI cargaba, pero varios widgets aparecían en cero o incompletos. No era un problema visual: había dos pérdidas reales de datos en backend.

## Antes

| Área | Síntoma |
| --- | --- |
| Cuenta / posiciones | `/api/account` devolvía `balance=0`, `equity=0`, `available=0`, `openPositions=0`, `positions={}`. |
| Dashboard logs | Binance listen key fallaba: el backend no podía abrir stream de cuenta. |
| Trading historial cerrado | `/trades.closed` podía quedar vacío tras reinicio aunque MySQL tuviera cierres. |
| Analytics / Intelligence | Parte de los bloques quedaba incompleta al depender de accountState vacío. |

## Causas

1. Variables `BINANCE_API_KEY` y `BINANCE_API_SECRET` con valor placeholder `change_me` anulaban las credenciales históricas de fallback del código.
2. `GET /trades` dependía de `closedTrades` en memoria. Al reiniciar el contenedor, esa memoria se perdía. El archivo persistido `/data/trades.json` contiene sólo operaciones abiertas.

## Correcciones aplicadas

| Archivo | Cambio |
| --- | --- |
| `/home/aterum_gui/shared.js` | Se agregó `envOrFallback()` para ignorar valores vacíos o `change_me` y restaurar compatibilidad con credenciales históricas. |
| `/home/aterum_gui/routes/trades.js` | `GET /trades` ahora rellena cierres desde MySQL (`trades` + `trade_closes`) si no están en memoria. |

Aplicación runtime:

- Se copiaron los archivos corregidos al contenedor `home-dashboard-1`.
- Se reinició únicamente `home-dashboard-1`.
- El servicio quedó `healthy`.
- Se persistió la imagen con `docker commit home-dashboard-1 aterum-dashboard:local`.

## Después

### Cuenta y posiciones

`/api/account` devuelve datos reales:

- balance: `208.95074855`
- equity: `207.33274855`
- available: `76.67212402`
- totalMargin: `132.27862453`
- totalUnreal: `-1.618`
- openPositions: `3`
- posiciones: `ZECUSDT SHORT`, `HYPEUSDT SHORT`, `SOLUSDT LONG`

### Trading

`/trades` devuelve:

- activos: `SOLUSDT`, `HYPEUSDT`, `ZECUSDT`
- cerrados desde MySQL: `ETHUSDT`, `ZECUSDT`, `SOLUSDT`

### Analytics

`/db/stats` devuelve:

- daily PnL: `1.82`
- trades cerrados: `3`
- win rate: `33.3%`
- symbols: `SOLUSDT +7.58`, `ETHUSDT -2.51`, `ZECUSDT -3.25`

### Simulator

`/api/simulator/report` devuelve:

- 12 señales históricas desde n8n.
- 6 opened, 6 rejected.
- `actual.summary` con 3 cierres reales y PnL `1.82`.

### Intelligence

`/api/intelligence/summary` devuelve:

- performance basada en cierres reales.
- 3 posiciones abiertas desde Binance.
- alertas, sesiones y noticias alimentadas.

## Pendientes no bloqueantes

Los siguientes bloques están vacíos porque no existen registros en MySQL, no por fallo de GUI:

- `trade_rejections`: 0 filas.
- `scan_events`: 0 filas.
- `post_trade_analysis`: 0 filas.

Cuando los workflows vuelvan a insertar rechazos, scans y post-trade analysis, esos widgets se llenarán sin cambios visuales.

No se ejecutaron órdenes reales de Binance.
