# Verificación de Aterum — 10 de octubre de 2026 (Costa Rica)

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
