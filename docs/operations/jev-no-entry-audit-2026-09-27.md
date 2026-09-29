# Auditoría de ausencia de entradas — 27 de septiembre de 2026

Verificación: 28-09-2026, aproximadamente 05:27–05:30 UTC (27-09, 23:27–23:30 de Costa Rica).

## Resultado

El flujo principal funciona y llega a Jev. La causa inmediata de la mayoría de las entradas omitidas es la respuesta `JEV_NO_TRADE`, anterior al cálculo del apalancamiento dinámico y al ejecutor. Una prueba real y aislada con la instantánea histórica de LDOUSDT identifica una influencia fuerte de `marketContext.intelligenceSignal`: la recomendación auxiliar `NO OPERAR` de confianza baja cambia el resultado de la clasificación aun cuando el score técnico, el contexto macro y 4H son favorables.

No se modificaron código de trading, workflows activos, variables, límites, posiciones ni órdenes durante esta auditoría. Las consultas a TypeSafe se hicieron directamente, sin pasar por el endpoint de evaluación de Aterum ni por Position Guard. Sus resultados históricos no se guardaron como propuestas ejecutables y no enviaron Telegram.

## Estado real

- Dashboard, n8n, Position Guard y demás contenedores: activos y healthy.
- `JEV_ENABLED=true`, `JEV_OBSERVE_ONLY=false`, `JEV_PROVIDER=typesafe-jev`.
- `JEV_DYNAMIC_LEVERAGE_ENABLED=true`, `JEV_MAX_LEVERAGE=10`.
- `N8N_TRADING_DISABLED=0`.
- Modelo resuelto antes y después del cambio: `jev-1.13.0`.
- Capacidad leída de Position Guard: `allowed=true`; balance/equity disponible 41.5845 USDT; margen restante utilizable 39.5053 USDT, reserva 2.0792 USDT; cero posiciones.
- Circuit breaker: inactivo. Capital guard: `halted=false`, sin motivos. Pausa global por pérdidas consecutivas: configurada en `0`.
- Riesgo de cartera y uso de margen configurados en 95%; reserva mínima 5%. Son valores existentes, no cambios de esta revisión.

## Cronología y recuentos

- Última apertura confirmada: KITEUSDT, 27-09 a las 17:45:25 UTC / 11:45:25 de Costa Rica; `trade_executions.final_status=VERIFIED`.
- Versión activa del workflow principal publicada a las 18:05:09 UTC / 12:05:09 local. Frente a la versión previa cambian `Position Sizer`, `Execute Trade` y `Build Trade Alert`. Los nodos de decisión del workflow coinciden con el snapshot del repositorio; las diferencias restantes son parámetros de Telegram sanitizados.
- Después de esa publicación hay 23 decisiones persistidas: 21 `JEV_NO_TRADE` y 2 `JEV_NO_FEASIBLE_POSITION`, ambas para BTCUSDT. Ninguna termina en `JEV_NO_FEASIBLE_LEVERAGE`, error de TypeSafe o propuesta LONG/SHORT rechazada por el ejecutor.
- Las últimas 10 decisiones son `JEV_NO_TRADE`. Ambas direcciones estaban disponibles en el preflight de esas consultas.
- Las ejecuciones principales revisadas terminan con estado `success` por la rama de rechazo. `success` en n8n significa que terminó el workflow, no que abrió una orden.
- También hay una interrupción del historial entre el 27-09 a las 21:42:40 UTC y el 28-09 a las 05:23:29 UTC, coincidente con contenedores arrancados a las 05:23. El historial por sí solo no identifica si fue apagado, suspensión o parada de servicios. Durante esa interrupción no consta ejecución del monitor ni análisis del schedule.
- Desde las 18:05 UTC hay 29 entregas en `notification_deliveries`, todas `SENT`. No se enviaron mensajes de prueba durante la auditoría.

## Prueba real con instantáneas históricas

Se mantuvieron los datos históricos, las opciones de dirección/SL/TP y las instrucciones de dirección. No se refrescaron datos ni se ejecutó trading. Las probabilidades son las de la clasificación Choice, no una tasa estimada de éxito financiero.

| Consulta aislada | Cambio | Respuesta de Jev | Probabilidades |
| --- | --- | --- | --- |
| LDOUSDT, solicitud actual de 5 preguntas | Ninguno | `NO_TRADE` | NO_TRADE 76%, LONG 24%, SHORT 0% |
| LDOUSDT, formato anterior de 7 preguntas | Se añaden las preguntas de leverage 1×–10× para comparar el formato; prueba histórica, no preflight operativo | `NO_TRADE` | NO_TRADE 73%, LONG 27%, SHORT 0% |
| LDOUSDT, 5 preguntas | Se retira únicamente `marketContext.intelligenceSignal` | `LONG` | LONG 92%, NO_TRADE 8%, SHORT 0% |
| KITEUSDT, instantánea que antes abrió | Se eliminan las preguntas de leverage, como en el formato dinámico | `LONG` | LONG 89%, NO_TRADE 11%, SHORT 0% |

TypeSafe confirmó `jev-1.13.0` en las cuatro respuestas. Uso reportado por estas cuatro pruebas: 30.035 tokens de entrada y 2.284 de salida. Ninguna respuesta recorrió el ejecutor ni modificó una operación. La prueba demuestra sensibilidad al contexto auxiliar en esta instantánea; no demuestra que todas las oportunidades rechazadas debieran abrirse.

Contrato consultado: [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice). La API acepta `state`, `model` y preguntas con opciones explícitas; devuelve elección, probabilidades y confianza. La selección de dirección se conserva sin forzar LONG ni SHORT.

## Origen de la señal que influye

1. `services/intelligence.js:getPerformanceContext` convierte los resultados monetarios de las últimas 12 operaciones en `recentBias` alcista/bajista/neutral. Este sesgo describe resultados del bot, no directamente la dirección de precios.
2. `computeBias` combina noticias, ese sesgo de resultados con peso ±1.5 y el signo del PnL abierto con peso ±0.4.
3. `buildSignal` devuelve `NO OPERAR` si no existe una sesión principal abierta, la puntuación no llega a ±1.8 o hay contradicción con una noticia dominante.
4. `buildAlerts` lo describe como «El modelo prefiere no operar», aunque esa señal proviene de estas reglas deterministas, no de una respuesta de Jev.
5. `services/opportunity_engine.js` ya aplica contribución cero a Intelligence de confianza baja.
6. `services/jev.js:stateFor` envía `marketContext` completo a Jev, incluyendo esa señal y sus alertas. No aplica la misma distinción entre evidencia de baja confianza y controles operativos.

En las propuestas válidas OPN, PYTH y KITE, Intelligence indicaba LONG de confianza media, puntuación 2.1. En todas las consultas posteriores que llegaron a Jev, indicaba `NO OPERAR` de confianza baja, normalmente puntuación 0.1 o 0.5. Se observó también un `NO_TRADE` de AVAX con esta señal antes del cambio de apalancamiento, a las 17:30 UTC.

Ejemplo LDO: score LONG 89, RSI 56.535, volumen 1.093×, 4H CONFIRMS, macro BULLISH y controles de riesgo permitidos. El texto auxiliar pesa mucho más en la respuesta que lo que su confianza baja sugiere. La cercanía temporal con el cambio de leverage no demuestra que el leverage sea la causa: la comparación aislada conservó LONG para KITE con el nuevo formato y conservó el rechazo para LDO con el formato anterior.

## Corrección recomendada en la auditoría inicial

Hacer explícita la separación entre datos de mercado, heurísticas auxiliares y vetos de riesgo en la instantánea de Jev. Intelligence de confianza baja no debería transmitirse como una decisión previa «el modelo no quiere operar», especialmente cuando el score técnico ya la ignora. Preservar datos relevantes de noticias/sesiones y el registro de la señal original, identificar su origen determinista y evitar que el historial de pérdidas se presente como dirección del mercado.

Conservar la elección independiente `NO_TRADE`/`LONG`/`SHORT`, las comprobaciones de saldo/capacidad, el riesgo monetario, el apalancamiento dinámico, Position Sizer, Position Guard y las validaciones de Binance. Validar el ajuste con las mismas instantáneas y pruebas de integración; no optimizar el prompt para conseguir aperturas ni usar estas respuestas históricas para ejecutarlas.

## Corrección implementada y desplegada — 28-09, 05:44 UTC

A petición del usuario, se implementó `services/intelligence_reference.js` como política compartida: solo `confidence=alta` permite usar Intelligence como referencia. La confianza `media`, `baja`, ausente o inválida elimina el objeto completo de las consultas de Jev y aporta cero a la contribución técnica. La referencia alta se identifica como heurística determinista y no sustituye la decisión de Jev ni los vetos operativos.

Archivos de ejecución modificados: `services/intelligence_reference.js`, `services/jev.js`, `services/opportunity_engine.js` y `routes/jev.js`. El resultado registra `intelligenceReference`; Telegram agrega si se aplicó o ignoró y la confianza recibida. El contexto original sigue disponible para la auditoría del workflow. Documentación actualizada en `docs/architecture/jev-integration.md`.

Validación automatizada: `test:jev` (49 pruebas aprobadas), `test:opportunity`, `test:execution`, `test:decision`, `test:workflow` y `build`, todos aprobados. Tras añadir comprobaciones específicas de persistencia y texto de Telegram se repitieron las dos pruebas de `jev_routes.test.js`, ambas aprobadas. Se verifica que el filtro afecta las dos consultas de apalancamiento dinámico, que alta queda como referencia, que baja/media no penalizan el score y que Jev puede seguir devolviendo `NO_TRADE`. Las pruebas de integración usan respuestas simuladas y no envían órdenes ni mensajes reales.

La imagen `aterum-dashboard:local` se reconstruyó y los cuatro archivos se aplicaron al contenedor actual. Se reiniciaron Dashboard, Chart API y n8n conservando sus contenedores y configuración. Copia previa de los tres archivos existentes: `/tmp/aterum-intelligence-before.xk4zasx_` (respaldo temporal fuera del repositorio).

Una consulta aislada a TypeSafe desde el contenedor desplegado, usando la función de filtrado nueva sobre la misma instantánea histórica LDO, devolvió `LONG` 90%, `NO_TRADE` 10%, modelo `jev-1.13.0`; uso 7.167 tokens de entrada y 489 de salida. El resultado no se guardó como propuesta ejecutable, no se envió Telegram y no se envió una orden a Binance.

Durante el primer reinicio solo del Dashboard, el ciclo automático 28321 (05:45:13 UTC) falló antes de Jev por `EAI_AGAIN` en `AGENTE DE MERCADO`: Chart API y n8n habían quedado en el namespace anterior. Se corrigió reiniciando también esos dos servicios. Desde Dashboard se verificó HTTP 200 en puertos 3001, 3000 y 5678 y en el reloj de Binance; desde n8n, HTTP 200 en Dashboard y Binance. Este ciclo fallido no evaluó Jev ni envió una solicitud al ejecutor. La verificación de entrega real del nuevo texto queda para una evaluación automática posterior; la ruta y persistencia están comprobadas con las pruebas automatizadas.

Banderas conservadas: `JEV_ENABLED=true`, `JEV_OBSERVE_ONLY=false`, `JEV_PROVIDER=typesafe-jev`, `JEV_DYNAMIC_LEVERAGE_ENABLED=true`, `JEV_MAX_LEVERAGE=10`, `N8N_TRADING_DISABLED=0`. No se modificaron límites de riesgo, órdenes, posiciones, cierres, SL Monitor ni Trailing Manager.
