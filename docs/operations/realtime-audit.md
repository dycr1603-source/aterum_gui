# Realtime Audit

Fecha: 2026-06-22

## Dashboard

Mecanismos detectados:

- WebSocket local `/ws` para mercado y cuenta.
- Binance futures websocket en backend para klines.
- User data stream Binance cuando hay credenciales validas.
- Polling:
  - `updatePnL`: 1s
  - `loadTrades`: 5s
  - `loadKlines`: 300s
  - `loadAccountData`: 300s
  - `loadDailyStats`: 300s

Estado:

- Dashboard responde `200`.
- Healthcheck `healthy`.
- No se modifico logica de trading ni Binance.

## Analytics

Mecanismos detectados:

- `/db/stats`
- `/api/research/summary`
- `/api/research/symbols`
- `/api/research/hours`
- `/api/research/rejections`
- `/api/research/setups`
- circuit breaker cada 10s
- cooldowns cada 30s

Estado:

- `/analytics` responde `200`.
- Widgets principales consumen datos reales de MySQL y Research API.

## Research

Mecanismos finales:

- carga inicial paralela:
  - `/api/research/reports`
  - `/api/research/recommendations`
  - `/api/research/recommendations/performance`
  - `/api/research/strategy-evolution`
- refresh moderado cada 60s

Motivo:

- Research no requiere updates por segundo; depende de reportes, recomendaciones y revisiones periodicas. El polling de 60s evita parpadeos y reduce carga.

Estado actual:

- `research_reports`: 1
- `ai_recommendations`: 13
- `recommendation_reviews`: 0

`recommendation_reviews` sigue en 0 porque las recomendaciones fueron generadas el 2026-06-22 y el motor espera al menos 24 horas de datos posteriores antes de evaluar impacto.

## n8n

Mecanismos detectados:

- schedules activos:
  - Main Schedule
  - Daily Trigger AI
  - Weekly Trigger
  - SL Monitor schedule
  - Trailing Manager schedule
  - Recommendation Review Engine schedule
- webhooks:
  - `sl-monitor-get`
  - `sl-monitor-set`
  - `sl-monitor-reset`

Estado:

- n8n responde en `:5678` y `/n8n/`.
- workflows visibles.
- credenciales visibles.
- executions visibles.

## Incidencias corregidas

- n8n escuchaba en IPv6 y nginx conectaba por IPv4.
- se agrego `N8N_LISTEN_ADDRESS=0.0.0.0`.
- se corrigieron credenciales Telegram historicas en SL Monitor y Trailing Manager.
- se recupero credencial SSH historica faltante para eliminar referencias rotas.
- AI Research fue separado de `/ai-data` para reducir carga visual y de render.

