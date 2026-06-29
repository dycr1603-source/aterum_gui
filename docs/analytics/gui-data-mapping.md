# GUI Data Mapping

Fecha: 2026-06-22 05:40 UTC

## Trading

| Widget / bloque | Endpoint | Campo esperado | Valor actual |
| --- | --- | --- | --- |
| Capital disponible | `/api/account` | `available` | `76.67212402` |
| Balance | `/api/account` | `balance` | `208.95074855` |
| Equity | `/api/account` | `equity` | `207.33274855` |
| Margen usado | `/api/account` | `totalMargin` | `132.27862453` |
| PnL flotante | `/api/account` | `totalUnreal` | `-1.618` |
| Posiciones abiertas | `/api/account` | `openPositions` | `3` |
| Estadística diaria | `/db/stats` | `daily[0]` | PnL `1.82`, WR `33.3%` |
| Watchlist activa | `/trades` | `active` | `SOLUSDT`, `HYPEUSDT`, `ZECUSDT` |
| Watchlist cerrada | `/trades` | `closed` | `ETHUSDT`, `ZECUSDT`, `SOLUSDT` |
| Gráfico | `/api/klines` | candles | Binance market data |
| Precios watchlist | `/api/all-prices` | symbol prices | Binance market data |

## Analytics

| Widget / bloque | Endpoint | Campo esperado | Valor actual |
| --- | --- | --- | --- |
| Cuenta en vivo | `/api/account` + `/api/account/stream` | balance/equity/positions | Datos reales de Binance |
| KPIs diarios | `/db/stats` | `daily`, `winLoss` | 3 cierres, PnL `1.82`, avg R `-0.01` |
| Performance por símbolo | `/db/stats` | `symbols` | `SOLUSDT`, `ETHUSDT`, `ZECUSDT` |
| Últimas operaciones | `/db/stats` | `recent` | 6 registros |
| Rechazos | `/db/stats` | `topRejections` | `[]`; tabla `trade_rejections` sin filas |
| Circuit breaker | `/cb/status` | `active`, `consecutiveSL` | `active=false`, `consecutiveSL=1` |
| Cooldowns | `/cooldown/status` | `active`, `count` | `count=0` |

## Simulator

| Widget / bloque | Endpoint | Campo esperado | Valor actual |
| --- | --- | --- | --- |
| KPIs de simulación | `/api/simulator/report` | `stats` | 12 señales, 6 opened, 6 rejected |
| Agrupación por contexto | `/api/simulator/report` | `groups` | Datos derivados de ejecuciones n8n |
| Señales históricas | `/api/simulator/report` | `signals` | 12 señales recientes |
| Resultado real | `/api/simulator/report` | `actual.summary` | 3 cierres, PnL `1.82` |

## Intelligence

| Widget / bloque | Endpoint | Campo esperado | Valor actual |
| --- | --- | --- | --- |
| Resumen IA | `/api/intelligence/summary` | `posture`, `signal`, `alerts` | Alimentado |
| Posiciones actuales | `/api/intelligence/summary` | `positions` | 3 posiciones reales |
| Performance reciente | `/api/intelligence/summary` | `performance` | 3 cierres reales |
| Noticias/sesiones | `/api/intelligence/summary` | `news`, `sessions` | Alimentado |
| AI Data trades | `/db/ai-data` | `trades` | 5+ registros recientes |
| AI Data rechazos | `/db/ai-data` | `rejections` | vacío; `trade_rejections` sin filas |
| Post-trade analysis | `/db/ai-data` | `postTrades` | vacío; `post_trade_analysis` sin filas |

## Conclusión por pantalla

- Trading: restaurado. Ya recibe cuenta real, posiciones reales, abiertos y cerrados.
- Analytics: restaurado para cuenta/trades/circuit breaker/cooldown. Rechazos vacíos por falta de registros en MySQL.
- Simulator: alimentado desde n8n SQLite y MySQL.
- Intelligence: alimentado desde MySQL, Binance accountState y servicios de contexto; sub-bloques de rechazos/post-trade vacíos por falta de registros.
