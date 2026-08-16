# Aterum GUI

Actualizado: 2026-04-29

## Importante

Este repo sirve el sistema live mediante `https://aterum.duckdns.org`. Los puertos directos del Dashboard, Chart API y n8n solo estan disponibles en loopback; nginx es la entrada publica.

El módulo [`telegram-control/`](./telegram-control/) expone el centro de monitoreo remoto de sólo lectura reutilizando las APIs existentes. No forma parte del flujo de trading.

Antes de hacer cambios visuales del dashboard, validar:

```bash
pm2 show dashboard
```

Si el `cwd` del proceso `dashboard` apunta a `/home/admin/aterum_gui`, este es el repo correcto.

Repo similar que puede causar confusion:

- `/home/admin/chart-api`

Mapa rapido del workspace:

- `/home/admin/DASHBOARD_WORKSPACE_MAP.md`

Dashboard web para monitorear el bot de trading, revisar posiciones, analitica, inteligencia de mercado y simular senales de n8n.

## Bot Control Center

La vista completa del sistema esta en [`bot-control/`](./bot-control/README.md): arquitectura, indice de documentos, workflows n8n sanitizados, infraestructura Docker de referencia y runbooks de operacion/recuperacion.

La documentacion tecnica canonica esta organizada por dominio en [`docs/`](./docs/README.md).

## Que incluye

- Dashboard principal en `/dashboard`.
- Analitica historica en `/analytics`.
- Simulador de senales en `/simulator`.
- Vista de inteligencia en `/ai-data`.
- API de cuenta, trades, cooldowns, circuit breaker y asistente IA.
- Servicio separado de screenshots/graficas TradingView en `server.js`.

## Estructura

```text
middleware/       Autenticacion y proteccion de rutas
routes/           Endpoints Express
services/         Integraciones y logica compartida
views/            HTML/CSS/JS server-side del GUI
server.js         Servicio de screenshots/chart API
trade.js          Dashboard principal en puerto 3001
shared.js         Pool DB, estado compartido y credenciales por env
```

## Configuracion

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` desde el ejemplo:

```bash
cp .env.example .env
```

3. Completar variables sensibles en `.env`:

```text
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
SESSION_SECRET=
DEFAULT_ADMIN_USER=
DEFAULT_ADMIN_PASSWORD=
BINANCE_API_KEY=
BINANCE_API_SECRET=
OPENAI_API_KEY=
N8N_SQLITE_DB=
N8N_TRADING_WORKFLOW_ID=
```

No subas `.env` al repositorio.

## Ejecutar

Dashboard:

```bash
npm start
```

Chart API:

```bash
npm run chart-api
```

Verificacion rapida de sintaxis:

```bash
npm run check
```

## Rutas principales

- `http://dashboard.internal:3001/dashboard`
- `http://dashboard.internal:3001/analytics`
- `http://dashboard.internal:3001/simulator`
- `http://dashboard.internal:3001/ai-data`
- `http://chart.internal:3000/chart`

## PM2 (recomendado)

Se incluye `ecosystem.config.cjs` para levantar ambos servicios sin depender de IP publica:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## Docker local en WSL

La configuracion reproducible para WSL esta en `docker-compose.yml`. La plantilla
segura de variables es `docker.env.example`; copiarla a `.env` y reemplazar los
valores marcados antes de arrancar.

```bash
cp docker.env.example .env
docker compose up -d --build
curl -f http://127.0.0.1:8080/healthz
curl -f http://127.0.0.1:8080/n8n/
```

El arranque por defecto mantiene `N8N_TRADING_DISABLED=1` y no habilita los
perfiles que requieren credenciales externas. Despues de validar Binance,
Telegram y el motor de ejecucion, levantar los auxiliares con:

```bash
docker compose --profile trading --profile aux up -d
```

Servicios locales: proxy `8080`, dashboard `3001`, Chart API `3000`, n8n `5678`.
La base MariaDB y Redis no publican puertos al host; sus datos persisten en
volumenes Docker. Detener con `docker compose down` y consultar logs con
`docker compose logs -f --tail=200 <servicio>`.

Dashboard, Chart API y n8n comparten namespace de red para conservar los
contratos historicos `127.0.0.1`. Tras reiniciar o recrear Dashboard, recrear
los tres servicios juntos:

```bash
docker compose up -d --force-recreate dashboard aterum_gui n8n nginx
```

## Simulador

La pantalla `/simulator` separa datos simulados y reales:

- **Simulacion**: calcula que habria pasado si una senal se hubiera abierto con un capital y leverage definidos por el usuario.
- **Real**: muestra trades cerrados reales, PnL positivo/negativo, win rate y agrupaciones por macro/4H.

El PnL simulado es aproximado:

```text
capital_simulado x leverage_simulado x movimiento_de_precio
```

## Seguridad

Este repo esta preparado para no versionar secretos:

- `.env` esta ignorado.
- `node_modules/` esta ignorado.
- `trades.json` esta ignorado.
- Las claves de Binance, OpenAI, DB y session secret deben venir de variables de entorno.

Si alguna clave real fue usada en un servidor, rota esas credenciales antes de publicar el repositorio.
