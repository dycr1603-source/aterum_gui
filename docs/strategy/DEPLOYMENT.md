# Reproducir, desplegar investigación y hacer rollback

Actualización 2026-10-04: Delcon usa activación manual en `enforce`, documentada en [DEPLOYED.md](DEPLOYED.md). Las instrucciones siguientes describen el despliegue conservador en investigación: requieren primero una política `mode: research`, `pair: null` y sin `manualActivation`. No describen la configuración activa. No hay estrategia aprobada cuantitativamente. El código mantiene `STRATEGY_ENGINE=legacy` por defecto para no cambiar silenciosamente una instalación existente. Elegir `two-indicator` con la política entregada **detiene nuevas entradas**; las posiciones existentes conservan guard, SL y trailing. No habilitar `enforce`: el análisis entregado no lo permite.

La construcción, sincronización y recreación se ejecutaron en Delcon; el rollback no se ejecutó. Ejecutarlos en la máquina que se quiera actualizar, desde el checkout que contenga estos cambios. `.env` y backups son privados. No copiar credenciales al reporte.

## Verificación local

```bash
cd ~/projects/aterum/aterum_gui
npm ci
npm run test:strategy
npm run test:offline
npm run build
```

Los tests offline bloquean conexiones de red y la carga de secretos locales. No envían mensajes ni órdenes.

## Reproducir el estudio

La captura de esta investigación está en `.local/strategy-v2/`, excluida de Git. El reporte agregado está en `docs/strategy/results.json`. Para una máquina sin captura:

```bash
cd ~/projects/aterum/aterum_gui
node scripts/strategy/export-baseline.js
npm run strategy:download
npm run strategy:experiment
node scripts/strategy/audit-baseline.js
node scripts/strategy/audit-close-boundaries.js
node scripts/strategy/audit-entry-orders.js
node scripts/strategy/summarize-baseline.js
node scripts/strategy/render-report.js
```

`export-baseline.js` se niega a sobrescribir un baseline. Mover explícitamente el archivo anterior antes de iniciar un estudio distinto. Las descargas se reanudan desde caché, verifican continuidad y checksum, y usan APIs públicas de velas/funding. Las auditorías privadas son GET, usan las credenciales dentro del dashboard existente y se detienen ante rate limiting. Se pueden volver a ejecutar para completar las operaciones pendientes. Ningún script de investigación llama al adapter ni opera Binance.

Las fechas de este experimento son fijas para reproducibilidad. No volver a optimizar usando este OOS observado y presentarlo como una validación nueva. Antes de una búsqueda nueva, registrar otro holdout.

## Desplegar GUI y ruta nueva en investigación

El backup toma la imagen del contenedor existente y el grafo publicado de n8n; funciona también con el contenedor detenido y no se limita al tag Docker actual. Lee SQLite desde un contenedor temporal sin red y con los volúmenes en sólo lectura. Guarda configuración y `.env` con permisos restringidos. No sustituye la base de datos ni los estados de protección.

```bash
cd ~/projects/aterum/aterum_gui
node scripts/strategy/backup-deployment.js
npm run strategy:workflow
npm run test:offline
npm run build
```

Guardar el modo de investigación en la configuración de Compose:

```bash
python3 - <<'PY'
from pathlib import Path
import json, re
policy = json.loads(Path('config/strategy-v2.json').read_text())
assert policy['mode'] == 'research' and policy['pair'] is None
p = Path('.env')
text = p.read_text()
line = 'STRATEGY_ENGINE=two-indicator'
if re.search(r'^STRATEGY_ENGINE=', text, re.M):
    text = re.sub(r'^STRATEGY_ENGINE=.*$', line, text, flags=re.M)
else:
    text = text.rstrip() + '\n' + line + '\n'
p.write_text(text)
p.chmod(0o600)
PY
```

Construir antes de detener servicios. Sincronizar con n8n y el consumidor Telegram detenidos, como exige el sincronizador existente. Position Guard continúa durante la importación. Los servicios que comparten el namespace de red del dashboard se recrean juntos al actualizar la imagen.

```bash
docker compose --profile trading --profile ai --profile aux build dashboard
docker compose --profile trading --profile ai --profile aux stop n8n telegram_control
N8N_TRADING_DISABLED=1 node scripts/sync-local-workflows.js --publish
docker compose --profile trading --profile ai --profile aux up -d --force-recreate dashboard aterum_gui position_guard n8n telegram_control nginx
docker compose --profile trading --profile ai --profile aux ps
curl --fail http://127.0.0.1:3001/healthz
```

Si `sync-local-workflows.js` detecta un conflicto con cambios hechos en el editor n8n, detener el despliegue y revisar el diff. No borrar el registro ni sobrescribir el grafo para ocultar el conflicto. El comando con `N8N_TRADING_DISABLED=1` sólo afecta al importador; el bloqueo de nuevas entradas del despliegue viene de `STRATEGY_ENGINE=two-indicator` + `mode: research` + ausencia de estrategia aprobada.

Abrir `/strategy-performance` con una sesión autenticada. Debe mostrar `REJECTED` y promoción bloqueada. El motor puede informar `NO_SELECTED_PAIR`; es el resultado esperado. La tabla de eventos se crea de manera aditiva al consultar el API o al comenzar un ciclo nuevo.

## Rollback de despliegue

Usar el mismo checkout y su `.local/strategy-last-backup`. Restaurar sólo el workflow de entrada, `.env`, política y tag de imagen. El volumen n8n y MySQL no se restauran a un snapshot antiguo: deben conservar cierres, stops y operaciones posteriores al despliegue.

```bash
cd ~/projects/aterum/aterum_gui
docker compose --profile trading --profile ai --profile aux stop n8n telegram_control
node scripts/strategy/rollback-source.js
N8N_TRADING_DISABLED=1 node scripts/sync-local-workflows.js --publish
docker compose --profile trading --profile ai --profile aux up -d --force-recreate dashboard aterum_gui position_guard n8n telegram_control nginx
docker compose --profile trading --profile ai --profile aux ps
curl --fail http://127.0.0.1:3001/healthz
```

No ejecutar `build` entre retag y `up`: se usa la imagen anterior preservada. El resto del código fuente nuevo permanece en el checkout para revisión; el rollback anterior restaura el comportamiento desplegado. Las tablas aditivas de estrategia se conservan como auditoría. La ruta legacy recupera el modo que tenía el `.env` respaldado; volver a ella no implica una recomendación de rentabilidad.

## Reset del circuit breaker

Sólo después de resolver la causa y reconciliar la cuenta:

```bash
docker compose --profile trading exec -T dashboard node scripts/strategy/reset-breaker.js "Causa investigada y posiciones reconciliadas"
```

El comando comprueba capacidad, estado local/Binance y contabilidad pendiente, y registra el motivo. No cambia la estrategia seleccionada ni elimina las verificaciones de promoción.
