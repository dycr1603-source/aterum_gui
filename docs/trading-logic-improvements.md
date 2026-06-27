# Trading Logic Improvements

Fecha: 2026-06-23 UTC

## Alcance

Se usó Research como evidencia inicial, pero cada hipótesis fue contrastada contra MySQL, backend y workflows activos de n8n.

No se ejecutaron órdenes reales de Binance.

## Evidencia disponible

Dataset actual:

- trades: 8
- trade_closes: 7
- scan_events: 0 reales históricos antes del fix
- trade_rejections: 0 reales históricos antes del fix
- post_trade_analysis: 0 reales históricos antes del fix

Resultado por símbolo con cierres:

| Símbolo | Cierres | PnL | Expectancy |
|---|---:|---:|---:|
| ZECUSDT | 2 | -5.92 | -2.96 |
| ETHUSDT | 2 | -4.33 | -2.17 |
| HYPEUSDT | 1 | -2.22 | -2.22 |
| SOLUSDT | 2 | 4.78 | 2.39 |

Resultado por stage:

| Stage | Motivo | Cierres | PnL |
|---|---:|---:|---:|
| INITIAL | SL | 6 | -15.27 |
| LOCK | TP | 1 | 7.58 |

Conclusión: Research acierta al señalar pérdidas en INITIAL, pero la muestra es demasiado pequeña para excluir símbolos, restringir horarios o eliminar HIGH_VOLATILITY. La evidencia fuerte no está en los filtros de trading todavía; está en la pérdida de telemetría necesaria para aprender.

## Cambios realizados

### 1. Rechazos persistidos desde n8n

Workflow modificado:

- Advanced AI Trading Bot v2 - Clean

Nodos modificados:

- Build AI Skip Message
- Build AI Skip Message Image

Cambio:

- Cuando la IA rechaza una señal, ahora se llama a `POST /db/rejection`.
- El payload incluye símbolo, dirección, scores, indicadores, contexto 4H, macro bias, motivo de rechazo, motivo de entrada y setup label.
- El endpoint `/db/rejection` ahora también crea un `scan_events` con `pass_ai=false`.

Impacto esperado:

- Research podrá medir selectividad real.
- La GUI dejará de inferir crisis de selectividad desde datos incompletos.

### 2. Contexto de entrada guardado en trades

Backend modificado:

- `/home/aterum_gui/routes/analytics.js`

Endpoint modificado:

- `POST /db/trade/open`

Columnas añadidas a `trades`:

- `rsi14`
- `atr_pct`
- `vol_ratio`
- `funding_rate`
- `vwap`
- `current_price`
- `dynamic_threshold`
- `entry_reason`
- `setup_label`

Workflows modificados:

- Advanced AI Trading Bot v2 - Clean

Nodos modificados:

- Build Trade Alert
- Build Trade Alert of Image

Impacto esperado:

- Cada entrada queda asociada a la condición que la justificó.
- Post Trade Analysis ya no depende de campos inexistentes.

### 3. SL Monitor conserva contexto de aprendizaje

Workflow modificado:

- SL Monitor

Nodos modificados:

- Guardar Estado
- SL Monitor Code
- Post-Trade Agent

Cambio:

- El estado del SL Monitor ahora conserva `scanScore`, `dynamicThreshold`, `tf4h`, `marketContext`, `indicators`, `aiBias`, `aiReasoning`, `setupLabel` y `entryReason`.
- Cuando una operación cierra por SL, TP externo o TIME_EXIT, el resultado enviado al Post-Trade Agent incluye el contexto original.

Impacto esperado:

- Las pérdidas en INITIAL podrán explicarse con datos de entrada, no sólo por resultado final.

### 4. Post Trade Analysis enriquecido

Backend modificado:

- `/home/aterum_gui/routes/aidata.js`

Endpoint modificado:

- `POST /db/post-trade`

Columnas añadidas a `post_trade_analysis`:

- `trade_id`
- `entry_reason`
- `exit_reason`
- `setup_label`
- `ai_regime`
- `ai_bias`
- `tf4h_status`
- `macro_bias`
- `atr_pct`
- `rsi14`
- `vol_ratio`
- `funding_rate`
- `final_score`
- `scan_score`
- `dynamic_threshold`
- `entry_hour_utc`

Impacto esperado:

- Research podrá aprender por setup, símbolo, horario, régimen, score e indicadores.

### 5. Fix de pérdida silenciosa por `undefined`

Backend modificado:

- `/home/aterum_gui/routes/analytics.js`

Cambio:

- `insertScanEvent()` y `/db/rejection` convierten campos opcionales `undefined` a `NULL`.

Problema encontrado:

- MySQL2 rechazaba parámetros `undefined`.
- El endpoint podía fallar al persistir telemetría parcial cuando faltaban campos opcionales.

Impacto esperado:

- Rechazos y scans con datos parciales ya no se pierden.

### 6. Research muestra evidencia e implementación

Backend modificado:

- `/home/aterum_gui/routes/analytics.js`

GUI modificada:

- `/home/aterum_gui/views/research.js`

Cambios:

- `ai_recommendations` ahora incluye:
  - `evidence_level`
  - `implementation_status`
- La pantalla `/research` muestra:
  - Evidencia: baja, media, alta
  - Implementación: en prueba, implementada, descartada

Estado actual:

- 23 recomendaciones existentes quedaron como `evidence_level=baja` y `implementation_status=en_prueba`.

## Cambios deliberadamente no realizados

No se excluyó ETHUSDT.

Motivo:

- Sólo existen 2 cierres.
- No alcanza evidencia mínima.

No se excluyó ZECUSDT.

Motivo:

- Sólo existen 2 cierres.
- No alcanza evidencia mínima.

No se eliminó HIGH_VOLATILITY.

Motivo:

- Sólo existe 1 cierre asociado en los datos disponibles.
- No alcanza evidencia mínima.

No se restringieron horarios 00-04 UTC.

Motivo:

- La concentración horaria actual no tiene muestra suficiente para decidir un filtro robusto.

No se modificó:

- ATR
- RSI
- scoring
- Risk Guard
- trailing
- circuit breaker
- ejecución Binance

## Validación

Prueba controlada con `UNITTESTUSDT`:

- `POST /db/rejection`: OK
- `POST /db/trade/open`: OK
- `POST /db/post-trade`: OK

Evidencia SQL durante la prueba:

| trade_rejections | scan_events | trades | post_trade_analysis |
|---:|---:|---:|---:|
| 1 | 2 | 1 | 1 |

Luego se eliminaron todos los registros `UNITTESTUSDT`.

Verificación posterior:

| trade_rejections | scan_events | trades | post_trade_analysis |
|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 |

Workflows publicados:

- Advanced AI Trading Bot v2 - Clean
- SL Monitor

Verificación:

- La versión publicada de Advanced AI Trading Bot contiene persistencia de rechazos.
- La versión publicada de SL Monitor contiene `buildLearningContext`.

Servicios:

- mysql healthy
- redis healthy
- dashboard healthy
- aterum_gui healthy
- n8n up
- nginx up

## Resultado

La lógica de trading no fue endurecida prematuramente con una muestra pequeña.

Sí se corrigió el ciclo de aprendizaje real:

1. Señal rechazada queda registrada.
2. Señal aceptada queda registrada.
3. Entrada guarda contexto operativo.
4. SL Monitor conserva contexto.
5. Cierre alimenta Post Trade Analysis.
6. Research muestra evidencia y estado de implementación.

Esto permite que las próximas recomendaciones se basen en datos reales y auditables antes de tocar filtros de dinero real.
