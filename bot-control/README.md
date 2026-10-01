# Bot Control Center

Esta carpeta es el punto de entrada versionado para entender, desplegar y operar el bot completo. No reemplaza los modulos de produccion: los organiza y documenta.

## Mapa rapido

| Seccion | Contenido |
|---|---|
| [`architecture/`](./architecture/) | Arquitectura, flujos y limites entre servicios |
| [`docs/`](./docs/) | Indice tematico de auditorias y decisiones tecnicas |
| [`workflows/`](./workflows/) | Snapshots sanitizados de n8n e historial conocido |
| [`infra/`](./infra/) | Docker Compose de referencia, nginx, esquema SQL e imagen n8n |
| [`operations/`](./operations/) | Runbooks, validacion, backup y recuperacion |
| [`scripts/`](./scripts/) | Herramientas para actualizar snapshots sin publicar secretos |
| `private/` | Material local sensible; esta excluido de Git |

## Estado controlado

- GUI y Dashboard API: codigo en la raiz del repositorio.
- Definiciones versionadas: inventario en [`workflows/current/manifest.json`](./workflows/current/manifest.json). El estado publicado se comprueba en el n8n local.
- Esquema base: [`infra/database/schema.sql`](./infra/database/schema.sql).
- Topologia: [`architecture/README.md`](./architecture/README.md).
- Incidentes y auditorias: [`docs/README.md`](./docs/README.md).
- Despliegue de referencia: [`infra/README.md`](./infra/README.md).

## Regla de seguridad

Este directorio nunca debe contener `.env`, tokens, passwords, claves API, credenciales n8n cifradas ni bases SQLite de produccion. Los workflows versionados son snapshots sanitizados y requieren reasignar credenciales al importarlos.

## Instalar en el n8n local

Con `N8N_TRADING_DISABLED=1` y n8n/Telegram detenidos, ejecuta `npm run workflows:sync -- --publish` después de cada `git pull`. El instalador asigna la credencial Telegram local, detecta cambios en el editor, evita duplicados y verifica las versiones guardada y publicada. Guarda su registro privado en `.local/workflow-sync.json`. Para importar sin publicar, omite `--publish`. Consulta [cambio de PC](../docs/operations/pc-handoff.md) antes de iniciar consumidores.

## Actualizar el control center

1. Exportar los workflows desde n8n a un JSON temporal.
2. Ejecutar:

```bash
node bot-control/scripts/sanitize-workflows.js /ruta/export.json bot-control/workflows/current
```

3. Revisar `manifest.json`, validar que no haya secretos y registrar el cambio en [`CHANGELOG.md`](./CHANGELOG.md).
4. Actualizar los documentos o ejemplos de infraestructura que hayan cambiado.

Los snapshots no activan workflows ni ejecutan ordenes.
