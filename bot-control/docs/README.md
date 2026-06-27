# Catalogo de documentacion

La documentacion tecnica canonica permanece en [`../../docs`](../../docs/). Este indice la agrupa por dominio para que el sistema pueda recorrerse sin conocer su historia.

## Empezar aqui

- [Analisis de repositorios](../../docs/repository-analysis.md)
- [Arquitectura](../../docs/architecture.md)
- [Despliegue](../../docs/deployment.md)
- [Flujo de datos](../../docs/data-flow.md)
- [Componentes faltantes reconstruidos](../../docs/missing-components.md)

## n8n y workflows

- [Operacion de n8n](../../docs/n8n.md)
- [Analisis de workflows](../../docs/workflow-analysis.md)
- [Diferencias workflow vs codigo](../../docs/workflow-vs-code-gap-analysis.md)
- [Compatibilidad de nodos](../../docs/n8n-node-compatibility.md)
- [Estabilidad de n8n](../../docs/n8n-stability-audit.md)
- [Recuperacion de n8n](../../docs/n8n-recovery-report.md)
- [Correccion del Trailing Manager](../../docs/trailing-manager-code-fix.md)

## Datos y APIs

- [Auditoria de base de datos](../../docs/database-audit.md)
- [Diferencias de esquema](../../docs/schema-gap-analysis.md)
- [Auditoria de API](../../docs/api-audit.md)
- [Mapeo GUI-datos](../../docs/gui-data-mapping.md)
- [Telemetria](../../docs/telemetry-gap-analysis.md)
- [Consistencia del dashboard](../../docs/dashboard-data-consistency.md)

## Trading y tiempo real

- [Mejoras de logica justificadas](../../docs/trading-logic-improvements.md)
- [Sincronizacion en tiempo real](../../docs/realtime-sync-audit.md)
- [Grafico en tiempo real](../../docs/realtime-chart-audit.md)
- [PnL visual](../../docs/pnl-visual-improvements.md)
- [Auditoria cuantitativa de rechazos](../../docs/rejection-audit.md)
- [Dataset de rechazos](../../docs/rejection-audit-events.csv)

## Research y learning

- [Sistema AI Research y Learning](../../docs/ai-research-learning-system.md)
- [Implementacion Research Learning](../../docs/research-learning-implementation.md)
- [Uso de Anthropic](../../docs/anthropic-usage.md)
- [Reporting existente](../../docs/existing-reporting-system.md)

## UI y operacion

- [Layout de Analytics](../../docs/analytics-layout.md)
- [Restauracion de GUI](../../docs/gui-restoration-report.md)
- [Refactor UI/UX](../../docs/ui-ux-refactor.md)
- [Acceso publico](../../docs/public-access.md)
- [Limpieza de disco](../../docs/disk-cleanup-report.md)

## Documentos sensibles

Credenciales, passwords, bases SQLite y backups operativos no deben agregarse a este catalogo ni copiarse a `bot-control`. El repositorio contiene documentos historicos que deben revisarse y sanearse antes de hacerlo publico. La eliminacion de un archivo en un commit nuevo no borra secretos del historial Git; cualquier credencial expuesta debe rotarse.
