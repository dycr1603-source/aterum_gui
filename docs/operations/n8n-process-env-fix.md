# n8n process.env Compatibility Fix

Fecha: 2026-06-21

## Error

Workflow/nodo reportado:

```text
AI Market Context
```

Error:

```text
process is not defined
ReferenceError
```

Stack:

```text
VmCodeWrapper
@n8n/task-runner/dist/js-task-runner/js-task-runner.js
```

## Causa

n8n `2.26.8` ejecuta los Code nodes mediante JS Task Runner en modo seguro.

En ese modo el codigo corre dentro de `vm.runInContext`, donde `process` no existe por defecto. El workflow historico usa referencias como:

```javascript
process.env.INTERNAL_DASHBOARD_BASE
```

y expresiones como:

```javascript
process.env.TELEGRAM_CHAT_ID
```

Por eso el workflow falla aunque el codigo haya funcionado en versiones historicas.

## Correccion final aplicada

Los workflows historicos necesitan dos comportamientos al mismo tiempo:

- `process.env` disponible dentro de Code nodes.
- `this.helpers.httpRequest` disponible dentro de Code nodes.

En n8n `2.26.8`, el modo seguro mantiene `this.helpers` pero no expone `process`. El modo inseguro expone `process`, pero por defecto no enlaza `this` al contexto de n8n. Por eso aparecio despues:

```text
Cannot read properties of undefined (reading 'httpRequest')
```

en el nodo:

```text
Risk Guard
```

Para recuperar compatibilidad historica sin modificar workflows se creo una imagen local:

```text
aterum-n8n-compat:local
```

Archivo agregado:

- `/home/n8n-compat/Dockerfile`

El Dockerfile parchea el JS Task Runner para:

- ejecutar Code nodes con `this` enlazado al contexto de n8n en modo inseguro;
- pasar `process.env` completo al proceso del runner JS.

El cambio concreto en runtime deja:

```javascript
(async function() { ... }).call(context)
```

en lugar de ejecutar la funcion sin contexto.

Archivos modificados:

- `/home/docker-compose.yml`
- `/home/.env`
- `/home/.env.example`

Variables agregadas:

```env
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
N8N_RUNNERS_INSECURE_MODE=true
```

Variables ya existentes relacionadas:

```env
NODE_FUNCTION_ALLOW_BUILTIN=crypto
NODES_EXCLUDE=[]
```

## Reinicio realizado

Imagen construida y servicio recreado:

```bash
docker compose -f /home/docker-compose.yml build n8n
docker compose -f /home/docker-compose.yml up -d --force-recreate n8n
```

## Validacion

Variables cargadas en el contenedor:

```text
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
N8N_RUNNERS_INSECURE_MODE=true
INTERNAL_DASHBOARD_BASE=http://127.0.0.1:3001
```

Log de arranque:

```text
TASK RUNNER CONFIGURED TO START IN INSECURE MODE.
Activated workflow "SL Monitor"
Activated workflow "Trailing Manager"
Activated workflow "Advanced AI Trading Bot v2 - Clean"
Editor is now accessible via: http://15.229.49.86/n8n
```

Busqueda en logs recientes:

```text
process is not defined: no encontrado
ReferenceError en AI Market Context: no encontrado
Cannot read properties of undefined (reading 'httpRequest'): no encontrado
```

Prueba temporal ejecutada y eliminada:

```text
processType=object
dashboard=http://127.0.0.1:3001
health.ok=true
health.service=aterum-dashboard
```

Workflows reales activos despues del cambio:

```text
SL Monitor | active=true
Trailing Manager | active=true
Advanced AI Trading Bot v2 - Clean | active=true
```

## Nota de seguridad

Esta configuracion se aplica para compatibilidad con los workflows historicos. `N8N_RUNNERS_INSECURE_MODE=true` reduce el aislamiento del Code node y debe mantenerse solo porque estos workflows dependen de `process.env`.

Cuando los workflows sean migrados oficialmente a `$env` o a credenciales nativas de n8n, puede evaluarse volver al modo seguro.
