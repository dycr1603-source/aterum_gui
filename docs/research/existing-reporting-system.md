# Existing Reporting System

Fecha: 2026-06-22 UTC

## Workflows revisados

| Workflow | Activo | Reportes detectados |
| --- | --- | --- |
| `Advanced AI Trading Bot v2 - Clean` | si | Daily PnL Report, Daily Analysis Report, Weekly Deep Analysis, Telegram reportes operativos |
| `SL Monitor` | si | Post-Trade Agent, Telegram de SL/TP/post-trade |
| `Trailing Manager` | si | Telegram de SL actualizado |
| `Telemetry Persistence Test` | no | workflow temporal inactivo |
| `Telemetry Persistence Webhook` | no | workflow temporal inactivo |

## Reportes existentes

### Daily PnL Report

- Workflow: `Advanced AI Trading Bot v2 - Clean`
- Nodo: `Daily PnL Report`
- Trigger: `Daily Trigger AI`
- Hora: 18:00 UTC
- Destino: `Telegram: Daily Report`
- Usa Anthropic: no
- Datos:
  - Binance Futures income del dia
  - Binance balance
  - Binance posiciones abiertas
  - `/db/stats`
- Envia a Telegram:
  - PnL realizado
  - comisiones
  - funding
  - net total
  - win rate
  - average trade
  - average R desde DB
  - profit factor
  - mejor/peor trade
  - balance, disponible, margen y unrealized
  - mejores/peores pares del dia
  - mejor hora del dia
  - posiciones abiertas

### Daily Analysis Report

- Workflow: `Advanced AI Trading Bot v2 - Clean`
- Nodo: `Daily Analysis Report`
- Trigger: `Daily Trigger AI`
- Hora: 18:00 UTC
- Destino: `Telegram: Daily Report AI`
- Usa Anthropic: si
- Modelo final configurado: `claude-haiku-4-5-20251001`
- Datos anteriores:
  - `/db/stats`
  - trades cerrados del dia
  - trades abiertos del dia
  - rechazos agregados desde `/db/stats`
- Datos agregados ahora:
  - `/api/research/summary`
  - `/api/research/symbols`
  - `/api/research/hours`
  - `/api/research/rejections`
  - `/api/research/setups`
- Persistencia agregada:
  - `POST /db/research-report`
  - `report_type=daily`
  - `source_workflow=Advanced AI Trading Bot v2 - Clean / Daily Analysis Report`

### Weekly Deep Analysis

- Workflow: `Advanced AI Trading Bot v2 - Clean`
- Nodo: `Weekly Deep Analysis`
- Trigger: `Weekly Trigger`
- Frecuencia: semanal
- Hora: 14:00 UTC
- Destino: `Telegram: Weekly Report AI`
- Usa Anthropic: si
- Modelo final configurado: `claude-opus-4-6`
- Datos anteriores:
  - `/db/stats`
  - performance por hora
  - performance por par
  - performance por trailing stage
  - performance por regimen AI
  - razones de rechazo
- Datos agregados ahora:
  - Profit Factor
  - Expectancy
  - Drawdown
  - mejores/peores simbolos desde Research API
  - horarios mas/menos rentables desde Research API
  - rechazos IA
  - post-trade analysis
  - edge por setup
- Persistencia agregada:
  - `POST /db/research-report`
  - `report_type=weekly`
  - `source_workflow=Advanced AI Trading Bot v2 - Clean / Weekly Deep Analysis`

### Post-Trade Agent

- Workflow: `SL Monitor`
- Nodo: `Post-Trade Agent`
- Trigger: cierre real detectado por `SL Monitor Code`
- Destino: `Telegram: Post-Trade Agent`
- Usa Anthropic: si
- Datos:
  - trade cerrado
  - contexto de `/db/stats`
  - stage al cierre
  - PnL, R final, duracion
- Persistencia existente:
  - `/db/post-trade`
  - tabla `post_trade_analysis`

## Cambios realizados

- No se creo ningun Daily Report nuevo.
- Se extendieron los nodos historicos `Daily Analysis Report` y `Weekly Deep Analysis`.
- Se sincronizo tambien la version activa publicada (`workflow_history.activeVersionId`) para que n8n use los cambios en runtime.
- Se publico nuevamente el workflow `Advanced AI Trading Bot v2 - Clean` y se reinicio solo n8n.
- Se agrego tabla `research_reports`.
- Se agregaron endpoints:
  - `POST /db/research-report`
  - `GET /api/research/reports`
  - `GET /api/research/reports/latest`
- Se agrego una seccion visible `AI Research` en `/ai-data`.

## Estado final

Analytics sigue siendo la capa de datos y metricas.

Inteligencia ahora muestra interpretacion historica generada por Anthropic cuando los reportes reales se ejecuten.

No se creo ningun schedule paralelo ni workflow duplicado.

## Informe inicial

Se genero un informe inicial real con Anthropic usando los datos actuales del Research API para que la GUI no quede vacia hasta la proxima ejecucion programada.

- Tabla: `research_reports`
- Registro actual: `id=2`
- Tipo: `daily`
- Modelo: `claude-haiku-4-5-20251001`
- Origen: `Advanced AI Trading Bot v2 - Clean / Daily Analysis Report / initial-backfill`

El registro controlado de prueba anterior fue eliminado; el informe inicial actual fue generado por Anthropic con datos reales.
