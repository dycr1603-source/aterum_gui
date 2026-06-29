# Analisis de repositorios

Fecha de reconstruccion: 2026-06-21.

Repositorios clonados:

| Repositorio | Ruta local | Rama | Commit analizado | Rol detectado |
| --- | --- | --- | --- | --- |
| `dycr1603-source/n8nTradeSkill` | `/home/n8nTradeSkill` | `main` | `103c12a Add 2026-04-25 trading recovery notes and node fixes` | Base historica/documental de nodos n8n, fixes y referencias operativas. No es un servicio desplegable. |
| `dycr1603-source/aterum_gui` | `/home/aterum_gui` | `main` | `d09d999 update` | Dashboard Express, API interna de trading, API de chart/screenshot, vistas web y servicios auxiliares. |

## n8nTradeSkill

No contiene `package.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, nginx, migraciones SQL ni backend ejecutable. El valor del repositorio esta en la documentacion y en los codigos de nodos corregidos.

Archivos relevantes:

- `trading-bot/SKILL.md`: guia operativa del bot.
- `trading-bot/references/db-schema.md`: esquema historico esperado.
- `trading-bot/references/estado-productivo-2026-04-15.md`: estado funcional historico.
- `trading-bot/references/nodos-principales.md`: descripcion de nodos principales.
- `trading-bot/references/workflows/main-nodes.md`: referencias del workflow principal.
- `trading-bot/references/workflows/sl-monitor-code.md`: codigo historico del monitor SL.
- `trading-bot/references/workflows/trailing-manager-code.md`: codigo historico del trailing manager.
- `trading-bot/nodos-corregidos-2026-04-11/*`
- `trading-bot/nodos-corregidos-2026-04-15/*`
- `trading-bot/nodos-corregidos-2026-04-25/*`

Conclusion: este repo conserva la logica historica y fixes, pero no levanta infraestructura. Se usa como fuente de compatibilidad, no como servicio Docker.

## aterum_gui

`aterum_gui` si contiene una aplicacion Node/Express:

- `package.json`: scripts `start` (`node trade.js`), `chart-api` (`node server.js`) y `check`.
- `trade.js`: servidor dashboard/API en puerto `3001`.
- `server.js`: API de chart/screenshot en puerto `3000`.
- `routes/*.js`: APIs internas consumidas por workflows n8n.
- `views/*.js` y `assets/*`: frontend del dashboard.
- `shared.js`: estado compartido, pool MySQL, estado de circuit breaker/cooldowns y credenciales Binance via env con fallback historico.
- `services/simulator.js`: generador de reporte/politica del simulador.
- `ecosystem.config.cjs`: referencia PM2 historica.
- `.env.example`: variables de entorno, ampliado durante la reconstruccion.

No existian originalmente:

- `Dockerfile`
- `docker-compose.yml`
- nginx
- migraciones SQL versionadas
- dump de base de datos

## Endpoints encontrados en aterum_gui

Dashboard y vistas:

- `GET /healthz`
- `GET /`
- `GET /dashboard`
- `GET /ai-data`
- `GET /analytics`
- `GET /crypto-play`
- `GET /simulator`
- `GET /login`, `POST /login`, `GET /logout`, `GET /auth/logout`

API de trading, persistencia y analytics:

- `POST /db/trade/open`
- `POST /db/trade/close`
- `POST /db/trade/update-sl`
- `POST /db/rejection`
- `POST /db/scan`
- `GET /db/stats`
- `POST /db/post-trade`
- `GET /db/ai-data`

Estado operacional:

- `GET /cb/status`
- `POST /cb/sl`
- `POST /cb/tp`
- `POST /cb/reset`
- `POST /cooldown/set`
- `GET /cooldown/status`
- `DELETE /cooldown/:symbol`

Trades activos en memoria/archivo:

- `POST /trade`
- `DELETE /trade/:symbol`
- `GET /trades`
- `POST /sync`

Datos de mercado/cuenta:

- `GET /api/account`
- `GET /api/account/stream`
- `GET /api/all-prices`
- `GET /api/klines`
- `GET /api/price`
- `GET /api/depth`
- `GET /api/recent-trades`
- `GET /api/stream/:symbol`

Inteligencia/simulador:

- `GET /intelligence/signal`
- `GET /api/intelligence/summary`
- `POST /api/intelligence/chat`
- `GET /api/simulator/report`
- `GET /api/simulator/policy` reconstruido para compatibilidad con workflows.

Chart API:

- `GET /chart`
- `GET /healthz`
- `GET /`

## Dependencias externas

- Binance Futures REST/WebSocket.
- Anthropic Messages API.
- Telegram Bot API via credencial n8n.
- OpenAI API en el dashboard de inteligencia.
- Alternative.me Fear and Greed API.
- TradingView/chart renderer usado por `server.js`.
- MySQL/MariaDB.
- Redis, incluido como servicio esperado de infraestructura.
- n8n.

## Cambios de reconstruccion realizados

Se mantuvo la logica de trading. Los cambios fueron de infraestructura/compatibilidad:

- Se agrego `Dockerfile` a `aterum_gui`.
- Se agrego `flatted` como dependencia local para evitar depender de `/usr/lib/node_modules/n8n/...`.
- Se agrego `GET /api/simulator/policy`, endpoint esperado por el workflow principal.
- Se agregaron healthchecks `GET /healthz` en `trade.js` y `server.js`.
- Se amplio `.env.example` con variables usadas por workflows y servicios.
- Se creo `/home/docker-compose.yml`.
- Se creo `/home/database/schema.sql`.
- Se creo `/home/nginx/nginx.conf`.

## Hallazgos de seguridad

Los exports de n8n y parte del codigo historico contienen claves reales o con formato real. No se reproducen en estos documentos. Antes de operar en produccion deben rotarse:

- Binance API key/secret.
- Anthropic API key.
- Telegram bot token/credencial.
- `N8N_ENCRYPTION_KEY`, `SESSION_SECRET` y passwords de base de datos.
