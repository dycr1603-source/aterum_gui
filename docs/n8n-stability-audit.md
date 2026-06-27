# N8N Stability Audit

Fecha: 2026-06-24 UTC

## Hallazgos

- n8n estaba marcado como `Up`, pero el acceso por nginx fallaba porque el contenedor estaba unido a un namespace de red viejo del dashboard. Evidencia: nginx no podía conectar a `dashboard:5678` y `/n8n/` devolvía 502 antes de recrear n8n junto con dashboard/nginx.
- No hubo evidencia de OOM killer: `OOMKilled=false` en todos los contenedores.
- No había swap configurado (`Swap: 0B`).
- El root estaba crítico al inicio: `/dev/nvme0n1p1` con 102 MB libres, 99% usado.
- La base SQLite de n8n estaba creciendo por historial de ejecuciones: 10.723 ejecuciones y `database.sqlite` de ~403 MB.
- n8n guardaba ejecuciones exitosas y con error sin límite efectivo (`EXECUTIONS_DATA_SAVE_ON_SUCCESS=all`).
- Quedaba una referencia Telegram inválida en `Trailing Manager`: `x1mZkUQEGljslI3J`.

## Cambios aplicados

- Recreate ordenado de `dashboard`, `aterum_gui`, `n8n`, `nginx` para que n8n vuelva al namespace actual de dashboard y el puerto `5678` quede accesible.
- Añadidos límites de logs Docker en `docker-compose.yml`: `max-size=10m`, `max-file=3`.
- Añadido healthcheck para n8n usando `http://127.0.0.1:5678/n8n/`.
- Añadido healthcheck para nginx validando `/healthz` y acceso interno a n8n.
- Activado pruning de ejecuciones n8n:
  - `EXECUTIONS_DATA_PRUNE=true`
  - `EXECUTIONS_DATA_MAX_AGE=168`
  - `EXECUTIONS_DATA_PRUNE_MAX_COUNT=5000`
  - `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`
  - `EXECUTIONS_DATA_SAVE_ON_ERROR=all`
- Reducido log level de n8n a `warn`.
- Desactivadas notificaciones/templates/registry externo de n8n donde aplica.
- Corregida referencia Telegram inválida en `Trailing Manager` hacia `LTF24ID3cVOACeA1`.

## Estado final

- `home-n8n-1`: healthy.
- `/n8n/` local por nginx: HTTP 200.
- `/n8n/` público actual: `http://15.228.159.246/n8n/` -> HTTP 200.
- Logs recientes de n8n: sin errores nuevos en el último minuto validado.
- Ejecuciones n8n después de limpieza: `success=836`, `error=128`, `running=48`.
- Tamaño SQLite n8n después de compactación: ~41 MB.

## Actualización de IP pública

La IP anterior `15.229.49.86` dejó de responder. La IP pública actual detectada y aplicada en `/home/.env` es `15.228.159.246`.

## Riesgo residual

El servidor tiene 3.7 GiB RAM y no tiene swap. n8n quedó estable tras liberar disco y limitar historial, pero para operación de varios días conviene mover Docker a un disco mayor o ampliar el volumen root. Con 7.7 GiB totales, no es realista conservar varios GB libres mientras las imágenes activas ocupan ~3 GB.
