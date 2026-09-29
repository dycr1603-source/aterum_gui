# ZETAUSDT: reducción de riesgo y aviso recuperado

## Qué ocurrió

La posición SHORT de ZETAUSDT abrió el 28-09-2026 a las 06:00:26 UTC. Entrada 0.05169, cantidad 1195, apalancamiento 5×, SL inicial 0.05261 y TP 0.05033.

El Trailing Manager evaluó a las 06:27:00 UTC (00:27 de Costa Rica), con precio 0.05119, **0.543R** y **31.6% del PnL neto previsto al TP**. El primer hito permite reducir riesgo al alcanzar 0.60R **o** 30% del TP neto con al menos 0.35R. Por eso actuó antes de 0.60R.

Binance confirmó y el motor persistió el nuevo SL **0.05215**, ejecución `fef6b18d-1ec6-4291-9f22-ea6983eed8ea`, a las 06:27:03 UTC. El riesgo por distancia al stop pasó de 1.0994 a 0.5497 USDT, el 50%. La pérdida al nuevo stop incluyendo la reserva de comisiones se estimaba en 0.6738 USDT; esta reducción todavía no representa break-even ni ganancia asegurada.

La evaluación de las 06:30 vio 0.630R y el stop ya reducido, sin una mejora adicional válida. No correspondía repetir la misma modificación. El siguiente hito de break-even exige 1R o 50% del TP neto con al menos 0.50R y un stop compatible con el gap ATR y las comisiones.

## Fallo del aviso

La ejecución n8n 28731 llegó a `Telegram: SL Updated`, pero Telegram respondió HTTP 400, **`Bad Request: chat not found`**. El nodo conservaba un destino distinto del envío actual que funciona. La orden de Binance y su persistencia fueron exitosas aunque el workflow terminó con error en el aviso.

El estado técnico `INITIAL` se conserva por compatibilidad con el esquema de trading y las reglas. El mensaje ahora distingue la acción **RIESGO REDUCIDO**, para que ese estado no sugiera que el SL sigue intacto.

## Corrección aplicada

- `bot-control/workflows/code/trailing-manager-profit.js`: aviso con acción de protección, SL anterior/nuevo, riesgo inicial y restante, pérdida/protección neta estimada, R, avance al TP, cantidad, leverage, próximo hito y ejecución confirmada. Las fórmulas, umbrales y acciones de trading no cambian.
- `bot-control/workflows/code/send-trailing-notification.js`: reemplaza el antiguo nodo Telegram por el endpoint interno del Dashboard. Reutiliza token/destino configurados y el registro persistente `notification_deliveries`; procesa todos los ítems y registra `SENT`, `DUPLICATE`, `FAILED` o `UNKNOWN`.
- Clave por ajuste: `stop-update:<executionId>`. Un aviso confirmado exige verificación de Binance y persistencia verificadas. Un replay no repite una orden ni el mensaje.
- `scripts/patch-trailing-manager-profit.js` y `bot-control/workflows/current/trailing-manager.workflow.json`: snapshot actualizado.
- `scripts/publish-active-trailing-notifications.js`: publicación limitada a los dos nodos, con comparación de la política de protección, validación de topología, backup y nueva versión activa.
- `scripts/recover-trailing-notification.js`: recuperación explícita de un aviso rechazado; lee el resultado histórico, comprueba el recibo persistido y envía únicamente la notificación. No llama a Binance ni al ejecutor.
- `tests/trailing_manager_regression.test.js`, `tests/trailing_notifications.test.js`, `package.json`: cobertura y comprobaciones de las herramientas añadidas.

## Despliegue y prueba real

Se publicó la versión activa `1347dcb7-0ade-4301-8674-5123c1b3ff0d` del workflow existente `q32UEjoj5wNiBHil`, con n8n detenido brevemente y reanudado. No se creó otro schedule. Backup dentro del volumen n8n: `/home/node/.n8n/backups/database.sqlite.before-trailing-notifications-1790577393975`.

Se recuperó el aviso de ZETA mediante el endpoint existente: **`SENT`, `messageId=24466`**. Telegram aceptó el envío; esto no prueba lectura humana. Se identificó como aviso histórico recuperado, conservando la hora y los valores del ajuste. No se repitió el movimiento del SL.

Después se ejecutó únicamente el código del nuevo emisor con ese mismo evento histórico y la API real: respondió **`DUPLICATE`**, confirmando que el aviso no se vuelve a enviar. Los endpoints de Dashboard y n8n responden HTTP 200, y los contenedores están healthy.

Los tres ciclos automáticos posteriores comprobados (06:38, 06:39 y 06:40 UTC) terminaron `success`, sin error ni ajustes que requirieran aviso. La imagen Docker del Dashboard también se construyó correctamente; no fue necesario reiniciarlo para publicar los nodos de n8n.

## Pruebas automatizadas

`npm run test:workflow` aprobó las regresiones, incluidos 25 casos de trailing y 4 del emisor. Se reprodujo el caso de ZETA a 0.543R/31.6% y la ausencia de repetición a 0.63R; se comprobó el hito de 0.60R para LONG y SHORT. También aprobaron `npm run test:execution`, las 4 pruebas de `tests/telegram_delivery.test.js`, `npm run build` y `git diff --check`.

Las pruebas de órdenes utilizan un ejecutor simulado. El único envío real de esta revisión fue la recuperación autorizada del aviso ya confirmado. El trading y los monitores automáticos siguen operando con la política existente.
