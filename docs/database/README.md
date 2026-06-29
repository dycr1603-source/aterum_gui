# Database

- [Auditoria](./database-audit.md)
- [Diferencias de esquema](./schema-gap-analysis.md)

El esquema desplegable canonico permanece en `/home/database/schema.sql` y su snapshot versionado en `bot-control/infra/database/schema.sql`.

`position_guard_events` registra cada inconsistencia, acción correctiva, error y reconciliación entre Binance y MySQL.
