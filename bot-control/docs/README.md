# Catalogo de documentacion

La documentacion tecnica canonica permanece en [`../../docs`](../../docs/README.md), organizada por dominio para que el sistema pueda recorrerse sin conocer su historia.

## Empezar aqui

- [Analisis de repositorios](../../docs/architecture/repository-analysis.md)
- [Arquitectura](../../docs/architecture/architecture.md)
- [Despliegue](../../docs/deployment/deployment.md)
- [Flujo de datos](../../docs/architecture/data-flow.md)
- [Componentes faltantes reconstruidos](../../docs/architecture/missing-components.md)

## n8n y workflows

- [Operacion de n8n](../../docs/operations/n8n.md)
- [Analisis de workflows](../../docs/architecture/workflow-analysis.md)
- [Diferencias workflow vs codigo](../../docs/architecture/workflow-vs-code-gap-analysis.md)
- [Compatibilidad de nodos](../../docs/operations/n8n-node-compatibility.md)
- [Estabilidad de n8n](../../docs/operations/n8n-stability-audit.md)
- [Recuperacion de n8n](../../docs/operations/n8n-recovery-report.md)
- [Correccion del Trailing Manager](../../docs/trading/trailing-manager-code-fix.md)
- [Telegram Control](../../docs/telegram/telegram.md)
- [API reutilizada por Telegram](../../docs/api/api.md)
- [Ejemplos y validación Telegram](../../docs/telegram/telegram-control-examples.md)
- [Copiloto local-first](../../docs/telegram/copilot.md)

## Datos y APIs

- [Auditoria de base de datos](../../docs/database/database-audit.md)
- [Diferencias de esquema](../../docs/database/schema-gap-analysis.md)
- [Auditoria de API](../../docs/api/api-audit.md)
- [Mapeo GUI-datos](../../docs/analytics/gui-data-mapping.md)
- [Telemetria](../../docs/reports/telemetry-gap-analysis.md)
- [Consistencia del dashboard](../../docs/operations/dashboard-data-consistency.md)

## Trading y tiempo real

- [Mejoras de logica justificadas](../../docs/trading/trading-logic-improvements.md)
- [Sincronizacion en tiempo real](../../docs/operations/realtime-sync-audit.md)
- [Grafico en tiempo real](../../docs/trading/realtime-chart-audit.md)
- [PnL visual](../../docs/trading/pnl-visual-improvements.md)
- [Auditoria cuantitativa de rechazos](../../docs/research/rejection-audit.md)
- [Dataset de rechazos](../../docs/research/rejection-audit-events.csv)

## Research y learning

- [Sistema AI Research y Learning](../../docs/research/ai-research-learning-system.md)
- [Implementacion Research Learning](../../docs/learning/research-learning-implementation.md)
- [Auditoria, validacion y rollback de cambios](../../docs/learning/learning-change-audit-system.md)
- [Uso de Anthropic](../../docs/research/anthropic-usage.md)
- [Reporting existente](../../docs/research/existing-reporting-system.md)

## UI y operacion

- [Layout de Analytics](../../docs/analytics/analytics-layout.md)
- [Restauracion de GUI](../../docs/analytics/gui-restoration-report.md)
- [Refactor UI/UX](../../docs/analytics/ui-ux-refactor.md)
- [Acceso publico](../../docs/deployment/public-access.md)
- [Limpieza de disco](../../docs/reports/disk-cleanup-report.md)

## Infraestructura HTTPS

- [Informe de migracion DuckDNS](../../docs/deployment/duckdns-https-migration.md)
- [Indice de infraestructura](../infra/README.md)
- [Deployment](../infra/deployment.md)
- [Red y Security Group](../infra/network.md)
- [Reverse proxy](../infra/reverse-proxy.md)
- [Variables](../infra/environment.md)
- [SSL y renovacion](../infra/ssl.md)
- [Docker](../infra/docker.md)
- [Arquitectura HTTPS](../infra/architecture.md)

## Documentos sensibles

Credenciales, passwords, bases SQLite y backups operativos no deben agregarse a este catalogo ni copiarse a `bot-control`. El repositorio contiene documentos historicos que deben revisarse y sanearse antes de hacerlo publico. La eliminacion de un archivo en un commit nuevo no borra secretos del historial Git; cualquier credencial expuesta debe rotarse.
