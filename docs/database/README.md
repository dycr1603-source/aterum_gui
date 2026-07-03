# Database

- [Auditoria](./database-audit.md)
- [Diferencias de esquema](./schema-gap-analysis.md)

El esquema desplegable canonico permanece en `/home/database/schema.sql` y su snapshot versionado en `bot-control/infra/database/schema.sql`.

`position_guard_events` registra cada inconsistencia, acción correctiva, error y reconciliación entre Binance y MySQL.

`trade_executions` y `trade_execution_events` forman el ledger inmutable de solicitudes, respuestas Binance, read-back, reintentos y estado terminal. `trades.initial_sl_price` y `trades.trailing_stage` preservan el riesgo original durante sincronizaciones.

Decision Knowledge no crea tablas ni duplica datos. Usa las relaciones existentes y añade únicamente los índices `idx_trade_rejections_symbol_time` e `idx_scan_events_symbol_time` para correlaciones temporales acotadas.

Opportunity Engine añade:

- `market_scan_cycles`: cobertura, batch, selección y duración.
- `market_symbol_state`: frescura y próxima evaluación por símbolo.
- `market_opportunities`: contribuciones, blockers, ranking y selección.
