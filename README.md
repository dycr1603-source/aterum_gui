# Aterum GUI

Dashboard web para monitorear el bot de trading, revisar posiciones, analitica, inteligencia de mercado y simular senales de n8n.

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

- `http://localhost:3001/dashboard`
- `http://localhost:3001/analytics`
- `http://localhost:3001/simulator`
- `http://localhost:3001/ai-data`
- `http://localhost:3000/chart`

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
