# Database

- [Auditoria](./database-audit.md)
- [Diferencias de esquema](./schema-gap-analysis.md)

El esquema desplegable canonico permanece en `/home/database/schema.sql` y su snapshot versionado en `bot-control/infra/database/schema.sql`.

`position_guard_events` registra cada inconsistencia, acción correctiva, error y reconciliación entre Binance y MySQL.

Decision Knowledge no crea tablas ni duplica datos. Usa las relaciones existentes y añade únicamente los índices `idx_trade_rejections_symbol_time` e `idx_scan_events_symbol_time` para correlaciones temporales acotadas.
