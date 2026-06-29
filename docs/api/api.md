# API usada por Telegram Control

## Decision Knowledge

| Metodo | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/knowledge/trades?symbol=&limit=` | Lista de trades y rechazos con referencias estables. |
| GET | `/api/knowledge/trade/:id` | Objeto completo de decisión. |
| GET | `/api/knowledge/timeline/:id` | Eventos MySQL y nodos n8n correlacionados. |
| GET | `/api/knowledge/graph/:id` | Nodos y relaciones del grafo. |
| GET | `/api/knowledge/diff?id1=&id2=` | Únicamente diferencias entre dos decisiones. |
| GET | `/api/knowledge/rules` | Cambios, rule impact y reviews persistidos. |
| GET | `/api/knowledge/evidence/:id` | IDs de evidencia y ausencias explícitas. |

`:id` acepta `50`, `trade:50`, `t50`, `rejection:588` o `r588`. Las respuestas se cachean 30 segundos y exponen `X-Knowledge-Duration-Ms`.

No se crearon endpoints de negocio nuevos. El servicio compone los contratos existentes.

El Copiloto conserva este principio: selecciona y compacta un subconjunto de estos contratos según la pregunta. No mantiene una API paralela ni envía secretos, imágenes o respuestas completas a Claude.

| Información | Endpoint reutilizado |
|---|---|
| Cuenta, balance, posiciones, precios, SL/TP | `GET /api/dashboard/state` |
| PnL diario/semanal, cierres y promedios | `GET /db/stats` |
| Win Rate, PF, expectancy y drawdown | `GET /api/research/summary` |
| Último informe Claude | `GET /api/research/reports/latest` |
| Recomendaciones | `GET /api/research/recommendations` |
| Performance de recomendaciones | `GET /api/research/recommendations/performance` |
| Learning | `GET /api/learning/summary` |
| Decisiones por posición | `GET /api/learning/decisions` |
| Cambios e impacto | `GET /api/learning/changes`, `/summary` |
| Noticias y AI Context | `GET /api/intelligence/summary?page=aidata` |
| Explainable AI e historial | Composición de `/db/stats`, Learning decisions/rules y `/db/ai-data` |
| Cambios del sistema | `GET /api/learning/changes` y Research recommendations |
| Simulación moderator | `GET /api/simulator/report` sin `force` |
| Dashboard | `GET /healthz` |
| n8n | `GET :5678/healthz` |

## Accesos directos justificados

- MariaDB: `telegram_users`, `telegram_audit`, eventos de `/logs` y scans persistidos para `/scan`.
- Redis: `PING` para `/health`.
- n8n SQLite: errores de ejecución y metadatos del Simulator, siempre read-only.
- Telegram/Binance: health público (`getMe`, `getWebhookInfo`, Futures ping).

## Endpoint nuevo

`GET http://telegram_control:3090/healthz` pertenece al sidecar y sólo se usa para el healthcheck Docker. No se publica por nginx ni por el host.

No se añadió ningún endpoint al Dashboard, Research, Learning, Analytics, Simulator o n8n.
