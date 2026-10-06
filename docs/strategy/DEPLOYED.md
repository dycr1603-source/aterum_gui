# Despliegue en Delcon — 2026-10-04

Activación manual solicitada expresamente por el usuario después de conocer el rechazo de validación. El reporte histórico conserva `REJECTED`; la autorización operativa se muestra como `MANUAL_UNVALIDATED`, nunca como validación aprobada.

- Motor: `STRATEGY_ENGINE=two-indicator`; política `enforce`.
- Señales: ADX + Bollinger, 4h, escala 0,8, dirección SHORT.
- JEV activo en ejecución, sin modo observación; leverage viable 5–10x.
- Riesgo por operación 0,5%; máximo agregado 2%; máximo dos posiciones.
- Gestión existente de stops/trailing; costes incluidos en dimensionamiento.
- Bloqueo semanal eliminado; métricas históricas conservadas.
- Activación vinculada al identificador del reporte y a sus parámetros exactos, con registro `MANUAL_ACTIVATION` en MySQL.

Se construyó la imagen de Dashboard/Chart API/Position Guard/Telegram. Se inspeccionaron y respaldaron las versiones de n8n existentes antes de crear el registro de sincronización local: no estaba presente en Delcon. Los cuatro workflows quedaron guardados y publicados, sin duplicados. Se recrearon los servicios que comparten imagen o namespace de red.

Verificación: 49/49 archivos de tests offline, build correcto, estado HTTP 200 del backend, página y API de estrategia con sesión autenticada. El estado del motor devuelve `two-indicator`, `enforce`, `allowed: true`, `validationPassed: false`. Capital status devuelve `weeklyBlockingEnabled: false` y `halted: false` al verificar el despliegue.

Respaldo privado: `.local/strategy-backup-A1s2mI`; imagen previa `aterum-dashboard:before-strategy-20261004072747`. Grafo completo previo de los cuatro workflows: `.local/strategy-v2/predeploy-workflows.json`; diff revisado: `.local/strategy-v2/deployment-workflow-review.diff`. El rollback documentado restaura el motor de entrada anterior, su imagen y configuración; mantiene datos y mejoras de SL/trailing publicados.

Saitama no fue modificada remotamente. Estos cambios están en el checkout y los contenedores de Delcon; la transferencia del código a Saitama requiere su proceso de actualización habitual.

## Ajuste de asignación solicitado después del despliegue

Leverage 5–10x, máximo dos posiciones, margen máximo 45% del equity por posición y 90% agregado. Se conserva el presupuesto de pérdida al stop de 0,5% por operación y 2% agregado: por eso el margen efectivo puede ser inferior al 45%. No se configuró arriesgar 45% de la cuenta. Los topes se verifican tanto en las proyecciones de JEV como en el ejecutor. Pruebas: 49/49 archivos de regresión y 29/29 pruebas de estrategia. Respaldo previo al ajuste: `.local/strategy-backup-2QA5Md`.

## Corrección de ciclos sin entrada

Se inspeccionaron ejecuciones reales del workflow principal: llegaban a `Two Indicator Decision`, terminaban correctamente con `NO_OPPORTUNITY` y la rama falsa de `If: Strategy Approved` no tenía salida. Había más de 160 símbolos elegibles, pero el índice de rotación avanzaba un símbolo cada cinco minutos mientras el programa principal corría cada quince. Se publicó una versión que avanza 24 símbolos por ciclo de 15 minutos y registra conteos de los motivos encontrados. La rama falsa pasa por `Strategy No Trade`, que entrega un resumen horario deduplicado mediante el servicio de Telegram existente. No altera señales ni envía órdenes cuando no hay oportunidad.

Verificación posterior: 49/49 archivos offline, build correcto, cuatro workflows publicados, backend HTTP 200. Un ciclo real respondió `NO_OPPORTUNITY` con 176 símbolos elegibles, 24 revisados, 19 `LOW_DEPTH` y 5 `NO_TWO_INDICATOR_SIGNAL`; es una decisión explicable, no un fallo de ejecución. Backup previo: `.local/strategy-backup-6DOtCT`.

## Escaneo completo y detalle por símbolo

El usuario pidió examinar todos los elegibles hasta que aparezca una oportunidad, y recibir el detalle por Telegram. Esta versión sustituye el bloque rotativo de 24: empieza en un punto rotativo y continúa por todos los símbolos elegibles hasta una propuesta aprobada o hasta agotarlos. Un `NO_TRADE` de JEV permite probar el siguiente símbolo; fallos de JEV, datos o API conservan el bloqueo de seguridad. Las velas y los dos indicadores se evalúan antes de consultar profundidad/funding, evitando esas consultas para símbolos sin señal técnica.

`Strategy Scan Report` enumera cada símbolo efectivamente revisado y sus motivos, incluidos los dos estados de indicadores. Divide el reporte en partes de menos de 4096 caracteres, con claves de entrega idempotentes por ciclo/parte. En ausencia de entrada se envía desde la rama falsa; tras una apertura confirmada se envía después del aviso de apertura. No se fuerza una operación para producir un reporte.

La primera prueba de escaneo completo se detuvo en la solicitud 97 con `API_PROBLEMS` y activó el circuit breaker. Se redujeron las consultas y se añadió espera/reintento ante HTTP 429 conforme al `Retry-After` de Binance. Después de comprobar capacidad y conciliación local/Binance, el breaker se reseteó con motivo auditado. Un ciclo real posterior terminó en unos 46 segundos: 175/175 elegibles revisados, `NO_OPPORTUNITY`, sin errores de API. Se enviaron y confirmaron **cuatro partes `SENT`** del reporte detallado por Telegram. Los motivos agregados fueron 165 sin señal conjunta, 10 de volatilidad excesiva, 9 de dirección deshabilitada y 1 de profundidad insuficiente; un símbolo puede tener varios motivos. Los nueve servicios quedaron saludables y el breaker sin bloqueo. Respaldo anterior al cambio: `.local/strategy-backup-kez8Tx`.

## Telegram compacto y transferencia a Saitama

A pedido del usuario, se eliminó de Telegram la lista de símbolos y sus motivos individuales. El último workflow publicado conserva el escaneo completo y su auditoría en `strategy_events`, pero envía como máximo un resumen breve por hora con total revisado y motivos agregados. No envía el informe de escaneo después de una apertura confirmada; esa apertura conserva su aviso habitual. Para preparar Saitama consulta [SAITAMA.md](SAITAMA.md).

## Apertura más frecuente y objetivo de ganancia mayor

Una instrucción posterior del usuario autorizó ampliar las entradas aun con la validación histórica rechazada. El escaneo sigue cubriendo todos los elegibles, pero la pareja ADX+Bollinger de 4h ahora usa ADX ≥22 y bandas ±1,8 desviaciones, y permite LONG y SHORT. JEV conserva la decisión final y puede responder `NO_TRADE`.

Los tres objetivos ofrecidos a JEV quedan al menos a 2,5 / 3 / 3,5 veces la distancia del stop más amplio, sujetos a precio válido del símbolo. Tras elegir niveles y leverage, sólo se ofrece una proyección cuyo beneficio neto estimado sea ≥1,5 veces la pérdida estimada al stop, con comisiones, slippage y reserva de funding. El ejecutor comprueba otra vez esa relación frente al precio de ejecución. Siguen vigentes el riesgo de 0,5% por entrada, 2% agregado, dos posiciones, leverage 5–10x, 45% de margen por posición y los bloqueos por datos, cuenta o divergencia.

Comparación diagnóstica con el histórico local de ocho símbolos 4h, usando los objetivos del backtest anterior y sin emular decisiones JEV: con ADX ≥22, bandas ±1,8 y ambos lados, el replay produjo 177 operaciones y −48,57 USDT en TRAIN, 58 y −20,46 en VALIDATION, 68 y −21,78 en OOS. Los objetivos nuevos de JEV no están modelados en ese replay. Por tanto, este cambio busca más oportunidades y una relación nominal mayor, **no** acredita rentabilidad. La activación sigue `MANUAL_UNVALIDATED`; el reporte original permanece rechazado.

Desplegado en Delcon el 2026-10-04 hora de Costa Rica, con respaldo privado `.local/strategy-backup-6bMeae` e imagen anterior `aterum-dashboard:before-strategy-20261005040124`. Las 49 suites offline, 35 pruebas de estrategia y el build pasaron. Tras recrear los servicios, los nueve contenedores estaban saludables, `/healthz` respondió correctamente, el workflow principal seguía activo con versión publicada, y el breaker estaba libre sin contabilidad pendiente. Aún no se ha observado una entrada real con esta revisión.

## Consenso de diez lecturas y ranking del universo

El ciclo posterior a ese despliegue revisó 186/186 activos: 171 quedaron sin coincidencia ADX+Bollinger, 13 fallaron la profundidad fija de 100.000 USDT y uno llegó a JEV, que eligió `NO_TRADE`. Esa evidencia motivó la nueva entrada autorizada por el usuario. Ocho indicadores direccionales (EMA, Supertrend, ADX, MACD, RSI, Stochastic RSI, Bollinger y VWAP) votan LONG o SHORT sobre velas cerradas de 4h. Se necesitan cinco votos en la misma dirección; ATR y RVOL aportan contexto y desempate, sin crear una dirección. El motor calcula todas las señales del universo elegible, comprueba profundidad en cada candidato técnico y ordena los que sobreviven por votos, oposición, confirmaciones, volumen, spread y profundidad. Consulta JEV empezando por el mejor; si JEV rechaza uno, continúa con el siguiente. Una aprobación sigue pasando por el dimensionamiento, recibo persistido, comprobación de riesgo, órdenes protectoras y confirmación Binance.

La profundidad mínima pasa a ser el mayor de 1.000 USDT y cinco veces el notional máximo estimado para una posición según equity, límite de margen y leverage. Se conservan filtro de volumen de 5 millones USDT/24h, spread de 10 bps, rechazo de volatilidad anormal y los límites monetarios anteriores. El reporte Telegram sigue siendo un resumen horario agregado; no enumera los símbolos.

Replay diagnóstico con ocho activos históricos 4h, costes y stops del backtest anterior, sin JEV ni libro histórico: TRAIN 244 operaciones / −68,49 USDT, VALIDATION 84 / −5,23, OOS 91 / −58,95. Es más frecuente, pero **no hay evidencia de rentabilidad**; los nuevos objetivos de JEV tampoco se modelan en ese replay. La activación está autorizada manualmente y continúa `MANUAL_UNVALIDATED`.

Durante la preparación, otro ciclo del motor anterior activó el breaker por `JEV_INVALID_RESPONSE`. La revisión nueva reintenta una vez esa respuesta para el candidato; si sigue inválida, pasa al siguiente y bloquea entradas sólo tras tres candidatos con la misma falla en un ciclo. Los demás fallos de JEV conservan el bloqueo inmediato. Antes de resetear el breaker se confirmó capacidad saludable, cero posiciones abiertas tanto en Binance como en MySQL y contabilidad sin pendientes; el reset dejó registro auditado.

Despliegue en Delcon: backup `.local/strategy-backup-ow3qae`, imagen anterior `aterum-dashboard:before-strategy-20261005042253`; 49 suites offline, 38 pruebas de estrategia y build correctos. Se sincronizaron y publicaron los cuatro workflows sin duplicados. El dashboard cargó `consensus10`, cinco votos, profundidad dinámica y `MANUAL_UNVALIDATED`; el workflow principal quedó activo/publicado. Ninguna entrada real de esta revisión se ha confirmado todavía.

El primer ciclo real de consenso examinó 186/186, encontró 94 candidatos de cinco o más votos y 49 con profundidad suficiente. JEV rechazó tres y el siguiente sufrió `JEV_LEVERAGE_POLICY_DATA_UNAVAILABLE`; el breaker bloqueó nuevas entradas. Las consultas firmadas de `leverageBracket` y `commissionRate` funcionaron después para BTC y ese símbolo, por lo que se trata como fallo aislado sin afirmar su causa exacta. La corrección reintenta una vez los errores transitorios de esas consultas, omite el candidato si persiste y conserva el bloqueo tras tres candidatos con fallos de datos JEV en el mismo ciclo. Ninguna orden se emitió en ese ciclo.

La revisión también descarta antes de JEV un símbolo cuyo lote/notional mínimo ya excede el presupuesto de pérdida aun usando la distancia mínima posible al stop. Este filtro evita gastar decisiones de JEV en activos como BTC que, con el capital actual, no permiten una posición suficientemente pequeña. El límite monetario sigue siendo el mismo; el filtro sólo detecta una inviabilidad matemática previa.

Esta corrección quedó publicada en Delcon con backup `.local/strategy-backup-l9wYuW` e imagen anterior `aterum-dashboard:before-strategy-20261005043752`. Pasaron 49 suites offline, 40 pruebas de estrategia y el build; el workflow principal quedó publicado, `/healthz` respondió, y el breaker continuó libre después del reinicio. La próxima ejecución programada determinará si JEV acepta algún candidato con las condiciones de mercado actuales.

## Primera operación confirmada y reducción de consultas

El ciclo de 2026-10-05 04:41 UTC revisó 183 activos y encontró 76 candidatos técnicos, 18 con mercado suficiente. JEV aprobó el primero del ranking: BNBUSDT LONG. La apertura quedó en MySQL como operación 53, con 0,01 BNB a 5x y entrada 790,12 USDT. Se comprobó directamente en Binance la posición y sus órdenes nativas de stop a 767,58 y take profit a 847,42, ambas activas al verificar. La propuesta registró siete votos LONG, cero SHORT, pérdida estimada al stop de 0,2594 USDT y objetivo neto estimado de 2,07R. Esto demuestra que la ruta de entrada funcionó; no acredita rentabilidad futura ni asegura el resultado de esta operación.

El ciclo siguiente revisó 187 activos, pero Position Guard recibió una respuesta de límite de peso IP de Binance (2400 solicitudes ponderadas por minuto). JEV no pudo confirmar capacidad y el breaker detuvo nuevas entradas; la posición BNBUSDT siguió protegida. Para reducir ese consumo, el motor conserva en memoria las velas 4h ya validadas hasta el próximo cierre de vela. JEV reintenta una vez la consulta temporal de capacidad después del cambio de minuto y, si un solo candidato sigue fallando, continúa con el siguiente; tres fallos de capacidad en un ciclo activan el breaker. El nodo de n8n concede hasta cinco minutos al ciclo para cubrir esa espera. La capacidad, la conciliación local/Binance y las órdenes protectoras se verificaron antes de resetear el breaker con motivo auditado.

Esta revisión se desplegó en Delcon con backup `.local/strategy-backup-0HJmuk` e imagen anterior `aterum-dashboard:before-strategy-20261005045224`. Pasaron 41 pruebas de estrategia, las 49 suites offline y el build. Los cuatro workflows quedaron publicados sin duplicados; los nueve servicios arrancaron y `/healthz` respondió. Saitama continúa apagada y no se ha modificado su instalación.

Una revisión adicional redujo el consumo del mismo límite IP en Position Guard: el sondeo de cinco segundos y la comprobación de capacidad consultan órdenes normales y condicionales sólo para los símbolos que tienen posiciones abiertas. Con una posición esto cambia dos consultas de todos los símbolos (peso 40 cada una) por dos consultas del símbolo (peso 1 cada una), según la documentación de Binance. No se reduce la frecuencia de vigilancia ni se usan órdenes de un símbolo diferente para certificar protección. El cambio pasó las 49 suites offline y el build, y se recreó Position Guard tras el respaldo `.local/strategy-backup-bAxIgQ`. Su endpoint de capacidad respondió HTTP 200 con BNBUSDT LONG conciliado y sin bloqueos.

El ciclo programado de 05:00 UTC terminó correctamente en 2 minutos y 4 segundos: 184/184 elegibles revisados, 75 candidatos técnicos, 50 descartados por profundidad y 25 rechazados por JEV; ningún segundo ingreso fue aprobado. No reapareció el límite de Binance, el breaker permaneció libre y la posición BNBUSDT siguió abierta. La cifra de 25 corresponde a rechazos de JEV sobre candidatos ordenados, no a un fallo del workflow.

## Asignación del 90% entre dos posiciones (2026-10-06)

La operación HYPEUSDT del 2026-10-06 se abrió con 0,07 HYPE a 5x, unos 1,31 USDT de margen. El límite de pérdida anterior de 0,5% del equity (aproximadamente 0,33 USDT con los 66,64 USDT que Binance informaba después) redujo el tamaño antes de llegar al límite de margen. Con el mismo stop estructural, una posición de 45% de margen a 5x habría expuesto aproximadamente 10% del equity al stop, antes de un posible deslizamiento extraordinario. HYPEUSDT ya estaba cerrada cuando se hizo este ajuste y no se modificó retroactivamente.

Por instrucción explícita del usuario, la nueva política toma como objetivo 45% del equity actual por cada una de dos posiciones y 90% conjunto, con 10% de reserva. El presupuesto de pérdida estimada al stop pasa a 22% por operación y 44% agregado para permitir llenar el cupo incluso si JEV elige hasta 10x; no representa una pérdida máxima garantizada. JEV sólo recibe apalancamientos cuya proyección llene al menos 95% del cupo disponible. Si el lote, la liquidez, el stop, la capacidad de Binance o los límites monetarios impiden ese tamaño, no se envía una orden pequeña para aparentar cumplir la instrucción. El ejecutor vuelve a comprobar margen, riesgo, JEV y órdenes protectoras antes de abrir.

En Delcon, Position Guard se alinea mediante `.env` a 90% de margen total, 10% de reserva, 44% de riesgo de cartera, 900% de exposición total, 450% por símbolo y 900% por dirección. Esos límites son necesarios para que una posición del 45% de margen a 10x no choque contra un límite de exposición de la configuración anterior. El respaldo privado anterior al cambio es `.local/strategy-backup-kOTMf2`. La política sigue `MANUAL_UNVALIDATED`: el backtest no prueba rentabilidad con este tamaño.

Desplegado en Delcon: 43 pruebas de estrategia, las 49 suites offline y el build pasaron. El contenedor cargó la política 45/90 y el endpoint de Position Guard confirmó los límites 44/90/10/900/450/900 con equity 66,6352 USDT, 59,9717 USDT de capacidad máxima de margen y 6,6635 USDT reservados. Los nueve servicios estaban saludables, `/healthz` respondió y el workflow principal continuó activo.

Primera entrada real con la política nueva: JUPUSDT LONG el 2026-10-06 07:11 UTC, 431 JUP a 5x. JEV proyectó 29,9631 USDT de margen y 10,6695 USDT de pérdida al stop. Position Guard registró luego 29,9054 USDT de margen real frente a 66,6464 USDT de equity: **44,87% del capital**, con 29,9902 USDT de capacidad restante para la segunda operación y 6,6646 USDT reservados. Se comprobó en Binance la posición de 431 JUP y sus órdenes nativas activas `STOP_MARKET` a 0,3242 y `TAKE_PROFIT_MARKET` a 0,4062. Esta apertura verifica el tamaño solicitado para una posición, no asegura que una segunda sea aprobada ni el resultado económico final.
