# Schema Gap Analysis

Fecha: 2026-06-22 05:40 UTC

## Comparación código vs base real

| Componente | Espera | Existe en MySQL | Resultado |
| --- | --- | --- | --- |
| Workflows n8n | `/db/trade/open` escribe `trades` | Sí | Compatible. |
| Workflows n8n | `/db/trade/close` escribe `trade_closes` y actualiza `trades` | Sí | Compatible. |
| Workflows n8n | `/db/trade/update-sl` actualiza SL/stage en `trades` | Sí | Compatible. |
| Workflows n8n | `/db/rejection` escribe `trade_rejections` | Sí, sin filas | Compatible; falta actividad reciente. |
| Workflows n8n | `/db/scan` escribe `scan_events` | Sí, sin filas | Compatible; falta actividad reciente. |
| SL Monitor | `/db/post-trade` escribe `post_trade_analysis` | Sí, sin filas | Compatible; falta actividad reciente. |
| Analytics GUI | `/db/stats` lee `daily_pnl`, `symbol_performance`, `trades`, `trade_rejections` | Sí | Compatible. |
| Intelligence GUI | `/db/ai-data` lee `trades`, `trade_rejections`, `post_trade_analysis` | Sí | Compatible. |
| Simulator GUI | `/api/simulator/report` lee n8n SQLite + MySQL | Sí | Compatible. |
| Trading GUI | `/trades` esperaba memoria de dashboard | Parcial | Corregido: ahora recupera cerrados desde MySQL. |

## Gaps detectados

### Gap 1: cuenta Binance en cero

El código de `shared.js` tomaba cualquier variable de entorno no vacía como credencial Binance. En compose existían valores `change_me`, por lo que se anulaban las credenciales históricas de fallback y Binance rechazaba el listen key.

Corrección aplicada:

- Archivo: `/home/aterum_gui/shared.js`
- Cambio: `envOrFallback()` ignora valores vacíos o `change_me`.
- Resultado: `/api/account` devuelve balance, equity, margen, PnL y posiciones reales.

### Gap 2: operaciones cerradas desaparecían tras reinicio

`/data/trades.json` sólo contiene operaciones abiertas. Antes, `GET /trades` devolvía `closedTrades` desde memoria; tras reiniciar el dashboard, esa memoria quedaba vacía aunque MySQL tuviera cierres.

Corrección aplicada:

- Archivo: `/home/aterum_gui/routes/trades.js`
- Cambio: `GET /trades` consulta `trades` + `trade_closes` y fusiona cierres recientes con memoria.
- Resultado: Trading vuelve a recibir cierres `ETHUSDT`, `ZECUSDT`, `SOLUSDT` desde MySQL.

## Endpoints solicitados pero no implementados literalmente

La GUI actual no usa estas rutas:

| Ruta | Estado |
| --- | --- |
| `/api/stats` | 404 |
| `/api/trades` | 404 |
| `/api/positions` | 404 |
| `/api/analytics` | 404 |

Los equivalentes reales usados por la GUI son:

| Función | Ruta real |
| --- | --- |
| Estadísticas | `/db/stats` |
| Trades Trading page | `/trades` |
| Posiciones/cuenta | `/api/account` |
| Analytics | `/db/stats`, `/cb/status`, `/cooldown/status` |

No se agregaron aliases porque la GUI no los consume actualmente y el criterio fue restaurar alimentación sin cambiar contratos existentes.
