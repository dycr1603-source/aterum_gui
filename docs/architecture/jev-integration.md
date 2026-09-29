# Jev real en el flujo de entradas de Aterum

El workflow principal de n8n conserva Discovery, Learning, Position Sizer, Execute Trade y los avisos existentes. `Jev Entry Gate` llama a `POST /internal/jev/evaluate` en Dashboard. El resultado se reserva por ciclo/símbolo en `jev_decisions`, de modo que un reintento no vuelve a consultar el modelo ni cambia la propuesta. La ejecución sigue pasando únicamente por Position Guard y Binance Futures de producción. Los cierres, Position Guard, SL Monitor y Trailing Manager siguen siendo los mismos.

## Proveedores

`JEV_PROVIDER=typesafe-jev` utiliza la API oficial `POST https://api.typesafe.ai/v1/systemone`, Bearer `TYPESAFE_API_KEY` y `JEV_MODEL=jev-latest`. La respuesta debe identificar un modelo `jev-*`. `JEV_PROVIDER=typesafe-adapter` utiliza el puente local con Claude Haiku; este proveedor se identifica como **Haiku adapter** en la decisión, el Dashboard y Telegram. No se sustituye uno por el otro automáticamente: si el proveedor seleccionado falla, la oportunidad termina en `NO_TRADE`.

Contrato oficial: [Quickstart](https://docs.typesafe.ai/introduction/quickstart) y [Choice](https://docs.typesafe.ai/primitives/choice). Antes de consultar al modelo, Dashboard lee la capacidad actual autenticada de Position Guard, el precio y los filtros de Binance. Proyecta para cada dirección, stop loss y apalancamiento de 1× a 10× el tamaño que sobreviviría al Position Sizer activo, incluyendo riesgo monetario, comisiones reservadas, margen, exposición, lote y notional mínimo. Solo ofrece a Jev las direcciones y combinaciones viables. Si ninguna existe, registra `JEV_NO_FEASIBLE_POSITION` en `jev_decisions`, omite la llamada a TypeSafe y envía un aviso de Telegram como máximo una vez por hora por motivo. Si falla la consulta de capacidad, el análisis termina cerrado sin consultar Jev. La capacidad puede cambiar entre esta lectura y el ejecutor; Position Sizer y Position Guard siguen verificando antes de abrir.

Una consulta que sí procede recibe una instantánea explícita: símbolo, temporalidad, precio y fecha, indicadores, velas y contexto. Los niveles se calculan desde ATR actual, se redondean al tick de Binance y se presentan como opciones numéricas concretas. Nunca se pide al modelo un precio de texto libre. Con apalancamiento dinámico activo, la primera consulta decide dirección y niveles, y una segunda pregunta Choice elige apalancamiento solo si la dirección es LONG o SHORT. Con el flag desactivado se conserva la consulta única anterior. `NO_TRADE` conserva su significado incluso si existe el antiguo flag `JEV_AGGRESSIVE_ENTRY`.

Se validan la identidad de la respuesta, modelo, opciones, confianza y probabilidades, vigencia de datos, drift del precio, niveles y bloqueos operativos. Position Sizer conserva el porcentaje monetario de riesgo del workflow activo (base 2%) y, para propuestas Jev, reserva comisiones de entrada/salida al 0.1% por lado. Position Guard comprueba de nuevo el recibo persistido, dirección, apalancamiento exacto, TP/SL, tick, lote de mercado, mínimo/máximo de cantidad, notional, tramo de apalancamiento de la cuenta (`/fapi/v1/leverageBracket`), comisión taker actual (`/fapi/v1/commissionRate`) y capacidad del portfolio **antes** de cambiar apalancamiento o colocar MARKET. Usa la mayor entre la comisión taker y el colchón del 0.1% por lado. Una comisión o tramo no disponibles bloquean la entrada. El presupuesto de riesgo de la cartera incorpora esas comisiones para las aperturas Jev.

Las notificaciones distinguen **propuesta de Jev real/Haiku adapter**, **orden confirmada por Binance**, **rechazo** y **cierre**. Una propuesta no equivale a una orden. El aviso de rechazo emitido por Dashboard evita un segundo aviso del mismo rechazo en n8n. Las entregas se guardan por clave de evento idempotente en `notification_deliveries`; el resultado real de Binance se registra en `trade_executions` y `trade_execution_events`.

Si el Position Sizer todavía rechaza una propuesta por un cambio de capacidad entre lecturas, `Execute Trade` devuelve `REJECTED` sin llamar a Position Guard. Telegram lo presenta como **operación omitida por capacidad** y limita ese aviso a uno por símbolo y hora, en vez de informar erróneamente una ejecución fallida en Binance.

## Configuración

### Referencia de Intelligence

Jev recibe la recomendación auxiliar de Intelligence **solo con confianza `alta`**. Con confianza `media`, `baja`, ausente o inválida, se excluye `marketContext.intelligenceSignal` completo de ambas consultas al modelo, incluidas sus alertas y ajustes. El scoring técnico también aplica contribución cero en esos casos, para evitar que una recomendación ignorada influya indirectamente por el score. Los datos macro, indicadores, velas, confirmación 4H y controles operativos se conservan.

La referencia alta se identifica como heurística determinista y `reference_only`; no es una respuesta anterior de Jev ni un veto operativo. Jev mantiene la elección independiente entre `NO_TRADE`, `LONG` y `SHORT`. El resultado persistido registra `intelligenceReference` con la política, confianza recibida, aplicación y motivo; Telegram informa si la referencia se aplicó o se ignoró. No requiere nuevas variables de entorno.

| Variable | Uso |
| --- | --- |
| `TYPESAFE_API_KEY` | Secreto para Jev real; solo `.env`, nunca en Git ni logs. |
| `JEV_PROVIDER` | `typesafe-jev` o `typesafe-adapter`. |
| `JEV_MODEL` | Alias oficial, normalmente `jev-latest`; se guarda el modelo resuelto. |
| `JEV_ENABLED` | Habilita el gate. |
| `JEV_DYNAMIC_LEVERAGE_ENABLED` | `true` activa dos consultas Choice: dirección/niveles y luego apalancamiento filtrado. `false` conserva la consulta única anterior. Solo afecta `typesafe-jev`. |
| `JEV_MAX_LEVERAGE` | Techo adicional entre 1× y 10×; nunca supera el límite absoluto de 10×. |
| `JEV_LEVERAGE_POLICY_PATH` | Ruta opcional al JSON de política; por defecto `config/jev-leverage-policy.json`. |
| `JEV_OBSERVE_ONLY` | `false` aplica la decisión; `true` observa y deja el flujo base. |
| `N8N_TRADING_DISABLED` | `1` impide aperturas desde Execute Trade. |
| `JEV_TIMEOUT_MS`, `JEV_MAX_DATA_AGE_MS`, `JEV_MAX_PRICE_DRIFT_PCT` | Límites de respuesta y vigencia. |
| `JEV_ADAPTER_TOKEN`, `JEV_ADAPTER_ANTHROPIC_API_KEY`, `JEV_ADAPTER_MODEL` | Sólo para Haiku adapter. |
| `JEV_CAPACITY_URL` | Endpoint interno autenticado de Position Guard; por defecto `http://position_guard:3091/portfolio-capacity`. |
| `EXECUTION_ENGINE_TOKEN` | Credencial interna ya existente para consultar capacidad; permanece fuera de Git. |

La clave TypeSafe se suministra por Compose a Dashboard. Position Guard recibe el nombre de proveedor para rechazar recibos emitidos bajo un proveedor anterior. Ningún servicio n8n recibe la clave TypeSafe. El workflow publicado debe actualizarse en la misma versión activa; `scripts/patch-jev-capacity-workflow.js` actualiza el snapshot del repositorio y `scripts/publish-active-jev-capacity.js` publica sólo `Execute Trade` y `Build Execution Failure`, tras copia de seguridad de SQLite y con n8n detenido. No se importa un segundo schedule.

Verificación local: `npm run test:jev`, `npm run test:execution`, `npm run test:workflow`, `npm run build`. Las pruebas de Jev y del ejecutor usan respuestas simuladas y no envían órdenes. Una llamada autenticada y aislada a TypeSafe puede verificar cuenta/modelo y las preguntas dinámicas sin conectar al ejecutor. Las pruebas de Telegram con entrega real deben usar el endpoint interno y una clave de evento exclusiva; el resultado `SENT` y `message_id` confirman entrega aceptada por Telegram, no lectura humana.

## Apalancamiento dinámico

En el flujo anterior, el preflight ofrecía los valores viables de 1× a 10× en la misma consulta Choice que decidía dirección y niveles. El Position Sizer aplicaba el valor elegido y Position Guard validaba de nuevo antes de abrir. Ahora, con `JEV_DYNAMIC_LEVERAGE_ENABLED=true`, el preflight y las comprobaciones de Binance siguen siendo los mismos, pero Jev elige primero `NO_TRADE`/`LONG`/`SHORT` y SL/TP. Si elige una dirección, una política determinista calcula las opciones de apalancamiento para ese lado y esos niveles. Jev elige entre esas opciones mediante otra pregunta Choice. Ningún rechazo de la política se convierte en una orden. No hay fallback al adaptador.

La política (`config/jev-leverage-policy.json`) combina probabilidad del lado, confianza independiente y diferencia respecto de la segunda opción. Un band de calidad fija un rango inicial. Los topes más conservadores por ATR %, distancia al SL, R:R neto estimado con comisión taker, score técnico, contexto 4H, macro, régimen, tendencia, RSI, volumen, posiciones abiertas y utilización de los **límites actuales** de cartera reducen ese rango. Cada valor restante debe pasar el mismo cálculo de tamaño/preflight, el tramo de apalancamiento de la cuenta en Binance y una comprobación conservadora: tras pérdida al SL y comisiones, el margen de la posición debe exceder mantenimiento más el colchón configurado. Esa comprobación es un filtro previo, no una predicción exacta del precio de liquidación en margen cruzado; Position Guard sigue siendo la autoridad final.

El riesgo monetario solicitado por el Position Sizer se calcula **sin apalancamiento**. Para una cantidad fija, `riesgo ≈ cantidad × (|entry−SL| + comisiones por unidad)` y `margen ≈ cantidad × entry / leverage`. Si el margen antes restringía la cantidad, un apalancamiento mayor puede permitir un notional mayor, pero la cantidad sigue limitada por el presupuesto monetario, exposición, margen, lotes y Position Guard. El registro de `jev_decisions.result.leveragePolicy` guarda probabilidad, confianza, margen de decisión, ATR %, distancia al SL, R:R neto, utilización de cartera, topes, opciones, selección y proyección. Position Sizer añade apalancamiento aplicado, notional, margen y riesgo estimado; `trade_executions.tradeContext.jev.leveragePolicy` conserva esa telemetría si se llega al ejecutor. Telegram muestra las opciones en la propuesta y el rango, selección, margen y riesgo estimado solo en la confirmación verificada.

La instantánea de KITEUSDT del 27-09-2026 registró `LONG 90%`, confianza `85%`, ATR `2.17%`, SL a `2.17%` y volumen `0.653×`; la política limita por ATR a 7×, por R:R neto a 5× y por volumen a 3×. La reproducción read-only con esa instantánea y los tramos/comisión actuales de Binance produjo **2× y 3×** como opciones. El contexto histórico no conserva `aiVision` ni `riskReduction`, por lo que esta reproducción usa sus valores por defecto; no afirma cuál habría elegido Jev ni que se haya enviado una orden nueva.
