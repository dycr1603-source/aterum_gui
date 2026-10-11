# Verificación de Aterum — 11 de octubre de 2026 (Costa Rica)

## Actualización: reentrada tras un cierre

- La entrada FFUSDT LONG (`4c3375e3-83c4-01de-73f0-d53e48962769`) falló con `STRATEGY_POLICY_CHANGED` antes de enviar una orden: dashboard ejecutaba la imagen nueva con `reentryCooldownMinutes=60`, mientras Position Guard conservaba la imagen anterior. Se recreó Position Guard con la imagen nueva. Ambos contenedores tienen ahora la misma imagen y cargan cooldown 60; la comprobación del guard devolvió HTTP 200, todos los servicios auxiliares sanos y una posición protegida de una. Se añadió una verificación de igualdad de imagen al procedimiento de Saitama. No se reenvió la ejecución fallida.
- La operación 64, WUSDT SHORT, cerró a las 21:00:22 UTC y la operación 66 abrió de nuevo WUSDT SHORT a las 21:15:25 UTC: apenas 15 minutos después. API3USDT LONG también cerró a las 21:15:06 UTC. La ejecución n8n 51277 (21:30:13–21:30:24 UTC) revisó 250 símbolos, calificó tres y JEV rechazó los tres; terminó `NO_OPPORTUNITY`.
- `new_opportunistic` consulta los cierres registrados en MySQL y excluye durante 60 minutos la misma combinación símbolo/dirección. La dirección contraria sigue disponible. El rechazo `REENTRY_COOLDOWN` ocurre antes de ordenar candidatos y consultar JEV, por lo que el siguiente candidato elegible asciende en la clasificación. El resumen de Telegram muestra solo el recuento agregado. Se mantiene el límite de tres posiciones y los controles de entrada; no se fuerza una apertura si ninguna alternativa pasa JEV y la ejecución.
- Pruebas completadas: estrategia 61/61, JEV 54/54, workflow 4/4, offline 52/52 archivos y build. Se respaldó el volumen n8n en `.local/backups/reentry-cooldown-VjKKXB` y la imagen previa en `.local/strategy-backup-o0uDTY`. Los cuatro workflows se sincronizaron y publicaron sin duplicados. La imagen nueva se instaló y n8n/Telegram se reanudaron con `N8N_TRADING_DISABLED=0`.

## Actualización: selección oportunista y JEV

- El motor `new_opportunistic` ordena primero los candidatos con profundidad suficiente y, dentro de ese grupo, por la puntuación de su señal. JEV evalúa ese orden hasta aprobar una entrada viable. Conserva los controles de capacidad, precio, SL/TP, comisiones, apalancamiento y confirmación de Binance. No abre una operación si todos los candidatos reciben veto.
- La señal usa ahora los 15 atributos y pesos congelados del experimento `inverse-market`; el backtest exige velas BTC alineadas. El modelo fue entrenado con velas de 5 minutos y se aplica a velas de 1 hora en vivo: su puntuación no es una probabilidad calibrada de ganancia.
- JEV recibe un contexto específico para esta señal: ADX y Bollinger son contexto, no requisitos adicionales. Un empate cercano entre `NO_TRADE` y la dirección propuesta puede resolverse a favor de la dirección, pero no se ignora un veto claro.
- Se corrigieron dos referencias de mercado que impedían oportunidades reales: la profundidad se mide alrededor del bid/ask actual del libro, y el desplazamiento de precio se compara con el último cierre de 5 minutos en lugar del cierre de la vela de 1 hora. Un libro sin bid/ask válido sigue rechazado.
- Primer diagnóstico sin órdenes: 245/245 elegibles, 129 señales, cero aprobaciones; 51 `JEV_PRICE_DRIFT`, 20 `JEV_STALE_DATA` y 58 `JEV_NO_TRADE`. Tras las correcciones: 245/245 elegibles, 129 señales, **JEV aprobó YBUSDT SHORT** después de 39 descartes. La decisión tuvo `passAI=true`, pero fue un diagnóstico con n8n detenido y `N8N_TRADING_DISABLED=1`, por lo que **no se envió una orden**.
- Los cuatro workflows están guardados/publicados y verificados sin duplicados. La imagen nueva está en dashboard; n8n, Telegram, dashboard, chart API, guard, nginx, MySQL, Redis y adaptador JEV están iniciados y sanos. `.env` y el proceso n8n tienen `N8N_TRADING_DISABLED=0`. La cuenta mostraba 59,1155 USDT de equity, cero margen usado, cero posiciones y `portfolio-capacity.allowed=true` al reactivar.
- La primera ejecución programada posterior, n8n **50840** (20:45:13–20:54:14 UTC), terminó `success`. JEV aprobó y Binance confirmó **WUSDT SHORT** (4055,8 unidades, apertura 20:45:58 UTC) y **API3USDT LONG** (289,5 unidades, apertura 20:48:43 UTC). Las dos operaciones aparecen `OPEN` con las mismas cantidades en MySQL. El tercer análisis revisó 245/245 elegibles y terminó `NO_OPPORTUNITY`; no se forzó una tercera orden.
- Al cierre de la comprobación, el guard estaba en `enforce`, con **2 posiciones protegidas de 2**, cero sin protección, cero ejecuciones pendientes y cero errores. Binance mostró margen usado 35,7458 USDT sobre equity fluctuante de 64,2545 USDT (55,6 % en ese instante), capacidad aún permitida y ninguna posición duplicada. El breaker seguía libre. Estas cifras son instantáneas y cambian con el mercado.
- Pasaron `npm run test:strategy` (60/60), `npm run test:jev` (54/54), `npm run test:workflow` (4/4) y `git diff --check`. Copias del volumen: `.local/backups/jev-relax-yxpmg4` y `.local/backups/workflow-draft-ZCQLik`.
- La autorización manual `MANUAL_UNVALIDATED` y el informe histórico rechazado permanecen. No hay evidencia de rentabilidad neta positiva fuera de muestra; este cambio corrige la ruta de selección y ejecución, no demuestra que la estrategia sea rentable.

## Informe anterior (10 de octubre)

## Estado de producción

- **Trading real habilitado por orden del operador:** `.env` tiene `N8N_TRADING_DISABLED=0`; el contenedor n8n se recreó con ese valor. El workflow principal está activo y su versión guardada coincide con la publicada. Los cuatro workflows gestionados se sincronizaron y publicaron sin duplicados. El horario principal es cada 15 minutos.
- **Estrategia:** `new_opportunistic`, velas de 1 hora, JEV en modo `enforce`, hasta tres posiciones, margen total máximo de 90 % del capital propio y reserva de 10 %. No se modificaron la fórmula, los pesos ni el umbral de la nueva señal. Se corrigió el paso de las velas BTC y la integración de esa versión con JEV, la ejecución y la reconciliación.
- **Activación:** `MANUAL_UNVALIDATED`. La autorización manual está ligada a la candidata y al informe concretos; `promotion` sigue siendo `null` y el informe histórico rechazado permanece intacto. No se presenta como estrategia validada ni rentable.
- **Circuit breaker:** reiniciado con razón auditada después de conciliar cero posiciones Binance y cero operaciones locales abiertas. El pico de equity pasó de 82 a **59,1155 USDT**; la pérdida previa no se borró de los registros. Se disparó de nuevo por `JEV_INVALID_IDENTITY` en la ejecución 50061 y se reinició una segunda vez tras corregir esa integración y volver a conciliar la cuenta. La protección por drawdown, racha, contabilidad y reconciliación sigue activa.
- **Guard de posiciones:** `enforce=true`, sano, sin posiciones desprotegidas y con Binance, MySQL, Redis, dashboard, n8n, Telegram, SL Monitor y Trailing Manager sanos en la última comprobación.
- **Servicios:** dashboard, chart API, n8n, guard, adaptador JEV, Telegram y nginx arrancados. Se conservó un respaldo del volumen n8n en `.local/backups/prod-n8n-8DamJQ` y uno de la estrategia/imagen anterior en `.local/strategy-backup-rSndAz`.

## Diagnóstico real previo a habilitar órdenes

El ciclo `25d42d78-891b-4806-ab74-8ac0554e8122` recorrió **181/181** mercados elegibles, con **171** candidatos técnicos y **107** con profundidad suficiente. JEV rechazó los 107; resultado `NO_OPPORTUNITY`, `passAI=false`, ninguna orden enviada. Duró aproximadamente **274 segundos** (05:36:40 a 05:41:14 UTC). Por ello se amplió de 300 a **600 segundos** el timeout de los nodos de decisión y siguientes posiciones; se volvieron a probar y publicar.

La primera ejecución programada real, n8n **50061** (05:45:13–05:47:44 UTC), terminó por la rama `Strategy Scan Report` con `JEV_INVALID_IDENTITY` tras examinar 180 mercados. Binance listó un símbolo no ASCII que la identidad de JEV no acepta. El universo ahora lo rechaza con `JEV_UNSUPPORTED_SYMBOL` antes de entrar al análisis; se añadió una prueba de regresión. No hubo orden en esa ejecución.

El diagnóstico posterior a la corrección, ciclo `1c44e205-904c-4bd6-8cbb-6555aaf2ff08`, terminó HTTP 200 con `NO_OPPORTUNITY`: examinó **176/176** elegibles y **81** candidatos con mercado apto. Al cierre, el breaker seguía `halted=0`, capacidad Binance `allowed=true`, equity **59,1155 USDT**, margen usado **0**, cero posiciones y cero operaciones locales abiertas. n8n permanecía con `N8N_TRADING_DISABLED=0` y timeout de 600 segundos.

La siguiente ejecución programada, n8n **50137** (05:55:08–05:57:58 UTC), terminó `success` por `Strategy Scan Report`: **178/178** elegibles, **78** candidatos con mercado apto, decisión `NO_OPPORTUNITY` y resumen Telegram `SENT`. No volvió a aparecer `JEV_INVALID_IDENTITY`. Tras esa ejecución, breaker `halted=0`, Binance `allowed=true`, cero posiciones y cero operaciones locales abiertas. Todos los servicios Compose seguían sanos.

## Evidencia de rentabilidad y límite

El informe histórico original de la investigación anterior sigue `REJECTED`: fuera de muestra **−30,61 USDT** sobre 1.000 USDT y walk-forward negativo. Una aproximación de la señal actual, con velas de 1 hora agregadas desde seis meses de datos locales de 12 símbolos y salida fija a seis horas, dio retornos medios netos negativos de **−27/−30/−48 puntos básicos** en entrenamiento/validación/holdout. Esa aproximación no es un backtest exacto de la cartera ni de JEV, pero tampoco ofrece evidencia positiva para operar. El capital real está expuesto a pérdidas.

## Pruebas

`npm run test:strategy`: **52/52**; `npm run test:jev`: **53/53**; `npm run test:workflow`, `npm run test:execution`, `npm run build` y `npm run test:offline` (**51/51 archivos**) completados correctamente. La prueba de integración añadida comprueba que JEV recibe la evidencia de `new_opportunistic` y que la versión es aceptada por la ruta de ejecución.

## Límite de esta verificación

El recorrido automático y la rama sin entrada están comprobados en producción. JEV no aprobó una operación en esos ciclos, de modo que ninguna apertura real nueva, bracket, salida o reconciliación posterior a una apertura pudo verificarse en esta sesión. El sistema queda habilitado para operar cuando la decisión de mercado/JEV y los controles de ejecución lo permitan.
