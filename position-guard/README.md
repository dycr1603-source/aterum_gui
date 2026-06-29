# Position Guard

Sidecar de seguridad que compara Binance con MySQL cada cinco segundos. Usa los niveles SL/TP ya calculados; no calcula indicadores ni cambia parámetros de trading.

- Verifica `STOP_MARKET` nativos mediante `/fapi/v1/openAlgoOrders`.
- Alerta si una posición no tiene protección nativa.
- Cierra por MARKET sólo si continúa sin STOP después de la ventana configurada.
- Reconcilia trades cerrados externamente.
- Persiste anomalías en `position_guard_events`.
- Envía alertas Telegram y expone `/healthz` interno.
- Verifica MySQL, Redis, Dashboard, n8n, Research, Learning, Binance, Telegram y activación de workflows críticos.

No crea, reemplaza, modifica ni cancela SL o TP. Tampoco calcula trailing. La ventana se configura con `POSITION_GUARD_UNPROTECTED_GRACE_MS` (60 segundos por defecto).
