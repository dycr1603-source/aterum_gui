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
