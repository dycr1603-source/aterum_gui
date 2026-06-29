# Anthropic Usage

Fecha: 2026-06-22 UTC

## Lugares donde aparece Anthropic

### Advanced AI Trading Bot v2 - Clean / AI Market Context

- Nodo: `AI Market Context`
- Uso: evalua contexto de mercado, score, bias, filtros y decision previa a operacion.
- Modelo/API: Anthropic Messages API.
- Contexto:
  - simbolo
  - direccion candidata
  - indicadores 1H
  - timeframe 4H
  - macro context
  - intelligence signal
  - policy historica del simulador
- Resultado:
  - `aiResult`
  - regimen
  - bias
  - ajuste de confianza
  - razonamiento
  - key risk
  - leverage recomendado

### Advanced AI Trading Bot v2 - Clean / Claude Code Command

- Nodo: `Claude Code Command`
- Tipo: SSH con `curl` a Anthropic.
- Uso: analisis visual de chart.
- Entrada:
  - imagen `/tmp/chart.jpg` en base64
  - direccion candidata
- Salida esperada:
  - JSON con `approve_trade`
  - `market_state`
  - `reason`
- Nodo posterior:
  - `Parse Output Of Claude`

### Advanced AI Trading Bot v2 - Clean / Daily Analysis Report

- Uso: reporte diario interpretativo.
- Modelo final configurado: `claude-haiku-4-5-20251001`
- Antes consumia:
  - `/db/stats`
  - trades del dia
  - rechazos agregados
- Ahora consume tambien:
  - `/api/research/summary`
  - `/api/research/symbols`
  - `/api/research/hours`
  - `/api/research/rejections`
  - `/api/research/setups`
- Prompt actualizado para cubrir:
  - Profit Factor
  - Expectancy
  - Drawdown
  - mejores/peores simbolos
  - horarios mas/menos rentables
  - rechazos IA
  - post-trade analysis
  - oportunidades y riesgos
- Persistencia:
  - `POST /db/research-report`
  - `report_type=daily`

### Advanced AI Trading Bot v2 - Clean / Weekly Deep Analysis

- Uso: analisis semanal profundo.
- Modelo final configurado: `claude-opus-4-6`
- Prompt actualizado para usar Research API y generar:
  - resumen ejecutivo
  - mejores patrones
  - problemas criticos
  - ajustes de scoring recomendados
  - optimizacion por horarios
  - mejores/peores pares
  - calibracion de trailing
  - rechazos IA y post-trade
  - plan semanal
- Persistencia:
  - `POST /db/research-report`
  - `report_type=weekly`

### SL Monitor / Post-Trade Agent

- Uso: analisis puntual despues de un cierre real.
- Modelo/API: Anthropic Messages API.
- Entrada:
  - simbolo
  - direccion
  - entry/exit
  - PnL
  - R final
  - stage
  - score AI
  - regimen AI
  - bias AI
  - indicadores al entrar
- Salida:
  - analisis corto de exito/fallo
- Persistencia:
  - `/db/post-trade`
  - tabla `post_trade_analysis`

## Inteligencia operativa parcial existente

Si. Ya existia inteligencia operativa antes de esta tarea:

- AI Market Context interpretaba setup antes de operar.
- Vision Claude filtraba contexto visual.
- Daily Analysis Report interpretaba el dia.
- Weekly Deep Analysis interpretaba la semana.
- Post-Trade Agent analizaba cierres.

La brecha no era falta de IA, sino falta de persistencia e interfaz historica para los reportes generados por Anthropic.

## Resultado de esta tarea

- Se mantiene Telegram.
- Se enriquece el Daily/Weekly existente.
- Cada Daily/Weekly generado por Anthropic queda preparado para persistirse en `research_reports`.
- `/ai-data` ahora muestra una seccion `AI Research` con ultimo informe, historico, filtros, recomendaciones, riesgos y oportunidades.
