# Trailing Manager Code Fix

Fecha: 2026-06-24

## Problema observado

El nodo `Trailing Manager Code` fallaba con:

```text
getaddrinfo EAI_AGAIN fapi.binance.com
```

Workflow afectado:

- `Trailing Manager`
- Workflow ID: `q32UEjoj5wNiBHil`
- Nodo: `Trailing Manager Code`

## Causa raiz

La llamada a Binance Futures `exchangeInfo` estaba fuera del bloque `try` que procesa cada simbolo.

Si DNS o Binance respondia temporalmente con `EAI_AGAIN`, el nodo Code completo fallaba antes de devolver un resultado controlado.

Esto no era un error de ATR, trailing, scoring ni estructura de reglas. Era una llamada de red sin retry/fallback suficiente.

## Cambio aplicado

Se modifico unicamente la tolerancia a fallos de red dentro del nodo `Trailing Manager Code`.

Cambios:

- Agregado `httpWithRetry(...)` para llamadas HTTP transitorias.
- Agregado detector de errores transitorios:
  - `EAI_AGAIN`
  - `ENOTFOUND`
  - `ECONNRESET`
  - `ETIMEDOUT`
  - `ECONNABORTED`
- `exchangeInfo` ahora usa retry y, si falla, no tumba el nodo completo.
- Si `exchangeInfo` no esta disponible, se usa tick fallback por simbolo.
- `ticker`, `klines`, `SL_GET` y `SL_SET` usan retry controlado.

No se modifico:

- ATR
- niveles R
- stages
- trailing
- time lock
- breakeven
- Risk Guard
- ordenes Binance

## Backup

Antes del cambio se creo backup:

```text
/home/docs/n8n-database-before-trailing-fix-20260624.sqlite
```

## Validacion

Sintaxis del nodo:

```text
syntax_ok
```

Conectividad desde n8n:

```text
DNS fapi.binance.com: OK
GET /fapi/v1/exchangeInfo: 200
```

Ejecucion posterior al parche:

```text
2026-06-24T16:58:22Z Trailing Manager started
2026-06-24T16:58:22Z Trailing Manager Code finished
2026-06-24T16:58:22Z If: SL Updated finished
2026-06-24T16:58:22Z Trailing Manager success
```

Servicios:

```text
n8n healthy
dashboard healthy
nginx healthy
mysql healthy
redis healthy
```

## Nota operativa

La tabla `execution_entity` de n8n sigue mostrando algunas ejecuciones recientes como `running`, pero el `n8nEventLog` confirma que el workflow completo termino `success`.

Ese comportamiento parece relacionado con persistencia/visualizacion de ejecuciones, no con fallo del nodo Code.

## Segundo diagnostico

Fecha: 2026-06-24 18:44 UTC

El usuario reporto que el nodo seguia sin funcionar. Se realizo una auditoria adicional y se encontro que:

- `Trailing Manager Code` si estaba ejecutando.
- El `n8nEventLog` mostraba `node.started`, `runner.response.received`, `node.finished` y `workflow.success`.
- La tabla `execution_entity` seguia dejando ejecuciones como `running`.

Causa real del segundo problema:

```text
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
```

Con esa configuracion, n8n no guardaba el run completo de ejecuciones exitosas. En esta instalacion eso provocaba que el historial/editor mostrara ejecuciones como si siguieran corriendo, aunque el event log confirmara `success`.

## Correccion de persistencia

Se cambio:

```text
EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
```

Archivos modificados:

```text
/home/.env
/home/docker-compose.yml
```

Se reinicio:

```text
n8n
nginx
```

Tambien se limpiaron 11 ejecuciones antiguas del workflow `Trailing Manager` que habian quedado falsamente en `running`.

Backup antes de la limpieza:

```text
/home/docs/n8n-database-before-trailing-status-cleanup-20260624.sqlite
```

## Validacion final

Ejecucion nueva posterior al cambio:

```text
32989|success|1|2026-06-24 18:44:00.020|2026-06-24 18:44:01.087
```

Event log:

```text
18:44:00 Trailing Manager started
18:44:00 Schedule Trigger finished
18:44:00 Trailing Manager Code started
18:44:01 Trailing Manager Code finished
18:44:01 If: SL Updated finished
18:44:01 Trailing Manager success
```

Resultado:

```text
Trailing Manager corre cada minuto.
Trailing Manager Code ejecuta.
La ejecucion queda cerrada como success en DB.
La UI ya no deberia mostrar esas ejecuciones nuevas como running.
```
