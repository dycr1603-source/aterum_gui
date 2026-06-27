# Analytics Layout Audit

Fecha: 2026-06-22 UTC

Pantalla auditada: `http://15.229.49.86:3001/analytics`.

## Widgets existentes antes del cambio

- Panel de cuenta: equity, balance, disponible, margen, PnL flotante, PnL del dia, posiciones abiertas.
- Interruptor de riesgo: estado, SL consecutivos, direccion, expiracion y progreso.
- Symbol cooldowns.
- Filtros: periodo, direccion y resultado.
- KPIs: PnL total, win rate, R promedio, mejor trade, peor trade, operaciones totales.
- Graficos: PnL acumulado, ganadas/perdidas, PnL semanal.
- Rendimiento por par.
- Razones de rechazo.
- Historial de trades.

## Espacios o metricas incompletas

- `Profit Factor`, `Expectancy` y `Drawdown` no estaban visibles como primera lectura.
- Las senales aceptadas/rechazadas ya existian en MySQL, pero no se veian como inteligencia operativa.
- `scan_events`, `trade_rejections` y `post_trade_analysis` estaban disponibles, pero no habia una subseccion que explicara edge por simbolo, horario o setup.
- Los rechazos se mostraban como lista basica, sin porcentaje sobre el total de senales.
- Post-trade analysis no era visible en Analytics.

## Cambios de interfaz aplicados

- Nueva subseccion `Research` dentro de Analytics.
- Nuevas tarjetas: Profit Factor, Expectancy, Drawdown maximo, senales aceptadas, senales rechazadas y post-trade analyses.
- Bloques nuevos: mejores simbolos, peores simbolos, horas mas rentables, rechazos de IA, edge por setup, post-trade analysis y errores recurrentes.
- Los KPIs superiores tambien incluyen Profit Factor, Expectancy, Drawdown y senales aceptadas/rechazadas.

## Evidencia visual

- Antes: `/home/docs/analytics-before.png`
- Despues: `/home/docs/analytics-after.png`

La captura `before` fue tomada desde la imagen Docker previa `sha256:ce3c3b6f...` en un contenedor temporal aislado. La captura `after` fue tomada desde el dashboard actual `home-dashboard-1`.

## Fuentes de datos reales

- `trades`
- `trade_closes`
- `trade_rejections`
- `scan_events`
- `post_trade_analysis`

No se agregaron placeholders ni datos hardcodeados.

## Validacion final

- `/api/research/summary` devuelve PnL real `1.82`, win rate `33.3%`, profit factor `1.32`, expectancy `0.61`, drawdown maximo `-5.76`.
- `/api/research/symbols` identifica `SOLUSDT` como mejor simbolo por expectativa y `ZECUSDT` / `ETHUSDT` como peores simbolos.
- `/api/research/hours` muestra el bloque `00-04` UTC como el unico bloque con cierres reales actuales.
- Los registros controlados de prueba (`TLM*` y `TELEMETRY*`) fueron retirados de MySQL para que Analytics no muestre datos simulados.
