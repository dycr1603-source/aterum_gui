# Database Audit

Fecha: 2026-06-22 05:40 UTC

Base auditada: `trading_bot` en `home-mysql-1`.

## Resumen

| Tabla/Vista | Tipo | Filas | Uso detectado |
| --- | --- | ---: | --- |
| `trades` | tabla | 6 | Operaciones abiertas/cerradas, usada por `/db/stats`, `/db/ai-data`, `/api/simulator/report`, `/trades` fallback. |
| `trade_closes` | tabla | 3 | Resultado de cierres, PnL, R final, motivo, stage. |
| `trade_rejections` | tabla | 0 | Rechazos de señales desde workflow. Widgets de rechazos vacíos por falta de datos. |
| `scan_events` | tabla | 0 | Escaneos de mercado desde workflow. Widgets de scans vacíos por falta de datos. |
| `post_trade_analysis` | tabla | 0 | Análisis post-trade desde SL Monitor. Widgets post-trade vacíos por falta de datos. |
| `circuit_breaker` | tabla | 2 | Estado/eventos de circuit breaker. |
| `users` | tabla | 2 | Usuarios administradores GUI. |
| `daily_pnl` | vista | derivada | KPIs diarios usados por `/db/stats`. |
| `symbol_performance` | vista | derivada | Performance por símbolo usada por `/db/stats`. |

## Estado de trading

| Métrica | Valor |
| --- | ---: |
| Trades totales | 6 |
| Trades abiertos | 3 |
| Trades cerrados | 3 |
| Cierres registrados | 3 |
| PnL cerrado total | 1.820000 |
| Último trade abierto | 2026-06-22 05:00:36 |
| Último cierre | 2026-06-22 03:01:31 |

## Índices

| Tabla | Índices |
| --- | --- |
| `trades` | `PRIMARY(id)`, `idx_trades_opened_at(opened_at)`, `idx_trades_status_opened(status, opened_at)`, `idx_trades_symbol_status(symbol, status)` |
| `trade_closes` | `PRIMARY(id)`, `idx_trade_closes_trade_id(trade_id)`, `idx_trade_closes_symbol(symbol)`, `idx_trade_closes_closed_at(closed_at)` |
| `trade_rejections` | `PRIMARY(id)`, `idx_trade_rejections_symbol(symbol)`, `idx_trade_rejections_rejected_at(rejected_at)` |
| `scan_events` | `PRIMARY(id)`, `idx_scan_events_symbol(symbol)`, `idx_scan_events_scanned_at(scanned_at)` |
| `post_trade_analysis` | `PRIMARY(id)`, `idx_post_trade_symbol(symbol)`, `idx_post_trade_created_at(created_at)` |
| `circuit_breaker` | `PRIMARY(id)`, `idx_cb_event_created(event_type, created_at)`, `idx_cb_expires(expires_at)` |
| `users` | `PRIMARY(id)`, `username(username)` |

## Columnas principales

`trades` contiene los campos que esperan los workflows y la GUI: `symbol`, `direction`, `status`, `entry_price`, `sl_price`, `tp_price`, `qty`, `leverage`, `margin`, `risk_pct`, `max_loss`, `max_gain`, `rr_ratio`, `final_score`, `scan_score`, `ai_regime`, `ai_bias`, `ai_reasoning`, `market_order_id`, `tp_order_id`, `sl_monitor`, `tf4h_*`, `macro_*`, `opened_at`, `updated_at`.

`trade_closes` contiene `trade_id`, `symbol`, `exit_price`, `pnl_usdt`, `pnl_pct`, `r_final`, `close_reason`, `trailing_stage`, `duration_minutes`, `closed_at`.

`trade_rejections`, `scan_events` y `post_trade_analysis` existen pero están sin registros; los widgets dependientes quedan vacíos correctamente hasta que n8n inserte eventos nuevos.
