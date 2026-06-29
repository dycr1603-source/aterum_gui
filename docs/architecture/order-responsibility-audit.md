# Auditoria de responsabilidades de ordenes

Fecha: 2026-06-29 UTC

## Resultado

La arquitectura conserva las responsabilidades historicas. La proteccion nativa inicial se incorporo a las dos ramas de `Execute Trade` como parte atomica de la apertura. `SL Monitor` conserva el cierre y registro, `Trailing Manager` conserva el calculo del SL logico y `Position Guard` queda limitado a observacion, alerta, reconciliacion y cierre de emergencia despues de una ventana sin proteccion.

Ningun componente distinto de `Execute Trade` crea o reemplaza SL/TP. Ningun componente modifica una orden STOP nativa despues de creada.

## Execute Trade

### Responsabilidad original

- validar configuracion de cuenta, margen y posicion;
- cancelar ordenes antiguas del simbolo antes de una nueva apertura;
- abrir la posicion MARKET y verificar su existencia;
- crear el TP inicial;
- registrar la apertura y entregar el estado a SL Monitor.

### Responsabilidad actual

Mantiene lo anterior y crea un `STOP_MARKET` nativo inicial antes del TP. La misma proteccion existe en `Execute Trade` y `Execute Trade1`. Si Binance no confirma el STOP, cierra inmediatamente la posicion recien abierta y aborta la apertura.

### Binance

- Lee: `positionRisk`, `exchangeInfo`, ticker, balance y modo de posicion.
- Crea: MARKET de entrada, STOP_MARKET inicial, TAKE_PROFIT_MARKET o LIMIT de TP; MARKET de rollback si falla el STOP inicial.
- Modifica: margen/leverage de cuenta; no modifica ordenes SL/TP existentes.
- Cancela: `allOpenOrders` del simbolo antes de abrir, comportamiento historico.

## SL Monitor

### Responsabilidad original y actual

- observar precio y posicion;
- ejecutar cierre MARKET cuando alcanza el SL logico;
- detectar cierres externos;
- cancelar ordenes restantes despues del cierre;
- registrar cierre, circuit breaker, cooldown y post-trade;
- aplicar exclusivamente ajuste temporal defensivo a posiciones `INITIAL` en perdida.

El ajuste temporal no es trailing: solo opera en perdida y en stage `INITIAL`. Trailing Manager opera en ganancia con BE/LOCK/TRAILING, por lo que los dominios son excluyentes.

### Binance

- Lee: `positionRisk` y ticker.
- Crea: MARKET de cierre por SL o TIME_EXIT.
- Modifica: ninguna orden Binance; puede actualizar el SL logico en n8n/MySQL.
- Cancela: `allOpenOrders` del simbolo solo despues de cerrar.

## Trailing Manager

### Responsabilidad original y actual

- calcular BE, TIME_LOCK, LOCK y TRAILING cuando la posicion esta en beneficio;
- aceptar un SL nuevo solo si mejora el anterior;
- actualizar el estado logico del SL Monitor, Dashboard y MySQL;
- notificar el cambio.

### Binance

- Lee: `exchangeInfo`, ticker y klines.
- Crea: ninguna orden.
- Modifica: ninguna orden Binance; modifica unicamente el SL logico.
- Cancela: ninguna orden.

## Position Guard

### Responsabilidad implementada inicialmente

Verificaba consistencia, pero tambien recreaba/reemplazaba STOP, cancelaba STOP obsoletos y recreaba TP. Esto se solapaba con la gestion de apertura y trailing.

### Responsabilidad corregida

- verificar posiciones y STOP nativos cada cinco segundos;
- alertar inmediatamente ante una posicion sin STOP;
- esperar `POSITION_GUARD_UNPROTECTED_GRACE_MS`;
- cerrar por MARKET solo si la posicion sigue desprotegida al terminar la ventana;
- reconciliar MySQL/Dashboard cuando Binance ya cerro;
- auditar eventos y salud de servicios/workflows.

No crea, reemplaza, modifica ni cancela SL/TP. No calcula ATR, trailing, score, Learning o Research.

### Binance

- Lee: posiciones, ordenes algo, historial de ordenes y fills.
- Crea: MARKET de emergencia, exclusivamente despues de la ventana sin STOP.
- Modifica: ninguna orden.
- Cancela: ninguna orden.

## Matriz final

| Capacidad | Execute Trade | SL Monitor | Trailing Manager | Position Guard |
| --- | :---: | :---: | :---: | :---: |
| Abrir posicion | Si | No | No | No |
| Verificar apertura | Si | No | No | No |
| Crear STOP inicial | Si | No | No | No |
| Crear TP inicial | Si | No | No | No |
| Calcular trailing | No | No | Si | No |
| Actualizar SL logico en ganancia | No | No | Si | No |
| Ajuste temporal en perdida INITIAL | No | Si | No | No |
| Modificar STOP nativo | No | No | No | No |
| Detectar SL/cierre externo | No | Si | No | Si, solo reconciliacion |
| Cerrar por SL logico | No | Si | No | No |
| Cierre por falta de proteccion | Rollback inmediato de apertura | No | No | Si, tras grace |
| Registrar cierre operativo | No | Si | No | Solo reconciliacion faltante |
| Cancelar ordenes | Antes de abrir | Despues de cerrar | No | No |
| Recalcular indicadores/score | No | No | No | No |

## Chart API

### Causa raiz

`aterum_gui` y n8n usan `network_mode: service:dashboard` para conservar los contratos historicos `localhost`. Dashboard fue recreado y obtuvo un namespace nuevo. n8n se recreo, pero Chart API permanecio en el namespace anterior: el contenedor aparecia `up`, aunque `127.0.0.1:3000` rechazaba o cerraba conexiones.

Las ejecuciones `84321`, `84387` y `84443` confirman la misma causa con `curl shim: fetch failed` contra `http://localhost:3000/chart`; no fueron errores de simbolo, TradingView, nginx ni del shim curl.

### Correccion

- se recrearon Dashboard, Chart API y n8n sobre el mismo namespace actual;
- el healthcheck de Dashboard comprueba ahora `3001/healthz` y `3000/healthz`;
- Chart API tiene healthcheck propio;
- Position Guard incluye `Chart API` en el health global.

Cuando se fuerce la recreacion de Dashboard se deben recrear conjuntamente `aterum_gui` y `n8n`:

```bash
docker compose up -d --force-recreate dashboard aterum_gui n8n
```

### Evidencia

- `http://127.0.0.1:3000/healthz`: HTTP 200.
- `/chart?symbol=BTCUSDT` local: JPEG 1280x800, 79,529 bytes.
- `/chart?symbol=BTCUSDT` publico: JPEG 1280x800, 79,866 bytes.
- Advanced Bot ejecucion programada `84563`: `success` entre `05:15:13` y `05:15:50 UTC`, despues de tres fallos de chart consecutivos.
- Dashboard, Chart API, n8n y Position Guard: healthy.
