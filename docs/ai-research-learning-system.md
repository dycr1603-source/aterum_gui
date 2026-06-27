# AI Research Learning System

Fecha: 2026-06-22

## Implementado

- Tablas nuevas:
  - `ai_recommendations`
  - `recommendation_reviews`
- Tabla existente reutilizada:
  - `research_reports`
- Extraccion automatica desde reportes Anthropic:
  - recomendaciones
  - riesgos
  - oportunidades
  - evidencia por simbolo y horario cuando aparece en el texto
- Endpoints nuevos:
  - `POST /db/recommendations/sync`
  - `POST /db/recommendations/review`
  - `GET /api/research/recommendations`
  - `GET /api/research/recommendations/performance`
  - `GET /api/research/strategy-evolution`
- Workflow n8n nuevo:
  - `Recommendation Review Engine`
  - frecuencia diaria
  - activo
  - llama a `/db/recommendations/review`

## GUI

La seccion `/ai-data#ai-research` ahora muestra:

- Overview
- How it works
- informes Anthropic
- recomendaciones rastreadas
- riesgos y oportunidades
- acciones manuales para operador
- performance de recomendaciones
- strategy evolution
- explicabilidad integrada

## Estado actual

- `research_reports`: 1
- `ai_recommendations`: 13
- `recommendation_reviews`: 0

Las recomendaciones estan en estado `pending` porque el informe existente fue generado el 2026-06-22. El motor de revision evalua recomendaciones con al menos 24 horas de datos posteriores para evitar conclusiones prematuras.

## Restricciones respetadas

- No se modifico ATR.
- No se modifico RSI.
- No se modifico scoring.
- No se modifico Risk Guard.
- No se modifico trailing.
- No se ejecutaron cambios automaticos en Binance.
- AI Research solo observa, recomienda y registra resultados.
