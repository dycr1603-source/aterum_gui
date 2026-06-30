# Position Guard

Servicio de ejecución y sincronización que trata Binance como fuente de verdad. n8n calcula decisiones, pero toda mutación de posición se envía a `POST /executions` y sólo se confirma después de releer posición y órdenes protectoras.

- Ejecuta apertura, movimiento SL/TP, TP parcial, trailing y cierre con ID idempotente.
- Reemplaza protección con orden seguro: crear, verificar, cancelar la anterior y volver a verificar.
- Persiste request, order ID, respuesta Binance, verificación, timestamps y estado final en `trade_executions`.
- Verifica `STOP_MARKET`, `TAKE_PROFIT_MARKET` y trailing en órdenes regulares y Algo API.
- Alerta si una posición no tiene protección nativa.
- Cierra por MARKET sólo mediante el motor verificado si continúa sin STOP después de la ventana configurada.
- Sincroniza qty, entry, leverage, SL y TP desde Binance hacia MySQL/n8n/Dashboard.
- Adopta posiciones Binance sin estado local y reconcilia cierres externos mediante fills reales.
- Persiste anomalías en `position_guard_events`.
- Envía alertas Telegram y expone `/healthz` interno.
- Verifica MySQL, Redis, Dashboard, n8n, Research, Learning, Binance, Telegram y activación de workflows críticos.

No calcula indicadores, niveles, trailing, score, Learning o Research. Esos valores llegan en la solicitud; el servicio sólo ejecuta, verifica y sincroniza. `/executions` requiere `Authorization: Bearer $EXECUTION_ENGINE_TOKEN` y sólo se publica en la red interna.
