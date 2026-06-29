# n8n

El servicio n8n queda incluido en `/home/docker-compose.yml` como `n8n` usando imagen `n8nio/n8n`.

URL local:

```text
http://127.0.0.1:5678
```

Tambien queda accesible via nginx para rutas `/webhook`, `/webhook-test`, `/rest` y `/n8n/`.

## Workflows disponibles en el servidor

Montaje en Docker:

```text
host /tmp -> contenedor /imports:ro
```

Archivos encontrados:

- `/imports/Advanced AI Trading Bot v2 - Clean (13).json`
- `/imports/SL Monitor (6).json`
- `/imports/Trailing Manager (3).json`

No se encontro `Operations Executor`.

## Estado de importacion

Los tres workflows encontrados fueron importados con `active=false`, usando el comportamiento seguro por defecto del CLI de n8n:

```text
Cz4TfvaVAygWGRJm  Advanced AI Trading Bot v2 - Clean  active=0
ZYhtV8yWXjNukrW4  SL Monitor                          active=0
q32UEjoj5wNiBHil  Trailing Manager                    active=0
```

Esto evita que los schedules llamen a Binance antes de rotar credenciales y revisar configuracion.

## Importacion manual/repetible

Desde la UI:

1. Abrir `http://127.0.0.1:5678`.
2. Crear owner/admin de n8n si la instancia esta vacia.
3. Importar los JSON desde `/tmp` en el host, o desde `/imports` dentro del contenedor.
4. Revisar credenciales rotadas.
5. Mantener workflows inactivos hasta verificar credenciales y modo de prueba.

Alternativa por CLI dentro del contenedor:

```bash
docker compose -f /home/docker-compose.yml exec -T n8n n8n import:workflow --input "/imports/SL Monitor (6).json"
docker compose -f /home/docker-compose.yml exec -T n8n n8n import:workflow --input "/imports/Trailing Manager (3).json"
docker compose -f /home/docker-compose.yml exec -T n8n n8n import:workflow --input "/imports/Advanced AI Trading Bot v2 - Clean (13).json"
```

Despues de importar, activar manualmente en este orden:

1. `SL Monitor`
2. `Trailing Manager`
3. `Advanced AI Trading Bot v2 - Clean`
4. `Operations Executor`, si se recupera el export faltante.

## Variables de entorno n8n

Definidas en Compose:

- `N8N_HOST`
- `N8N_PORT=5678`
- `N8N_PROTOCOL=http`
- `WEBHOOK_URL`
- `GENERIC_TIMEZONE`
- `TZ`
- `N8N_ENCRYPTION_KEY`
- `N8N_DIAGNOSTICS_ENABLED=false`
- `N8N_PERSONALIZATION_ENABLED=false`
- `EXECUTIONS_DATA_SAVE_ON_SUCCESS=all`
- `EXECUTIONS_DATA_SAVE_ON_ERROR=all`
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto`
- `INTERNAL_DASHBOARD_BASE=http://127.0.0.1:3001`
- `INTERNAL_N8N_BASE=http://127.0.0.1:5678`
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `ANTHROPIC_API_KEY`
- `TELEGRAM_CHAT_ID`
- `N8N_TRADING_DISABLED`

`NODE_FUNCTION_ALLOW_BUILTIN=crypto` es necesario porque los nodos Code firman requests Binance.

## Credenciales requeridas

Los exports referencian:

- Telegram credential `Telegram account`.
- SSH credential historica usada por nodos `executeCommand`/`ssh`.
- Binance API key/secret.
- Anthropic API key.

Recrear o reasignar credenciales despues de importar. No reutilizar claves hardcodeadas de exports historicos; rotarlas.

## Webhooks esperados

Del workflow `SL Monitor`:

- `GET /webhook/sl-monitor-get`
- `POST /webhook/sl-monitor-set`
- `POST /webhook/sl-monitor-reset`

Los workflows principal y trailing llaman esos webhooks usando `http://127.0.0.1:5678`, por eso n8n comparte namespace de red con el dashboard.

## Validacion sin ordenes reales

Validado:

- `GET http://127.0.0.1:5678/healthz` -> `{"status":"ok"}`
- Acceso desde el namespace compartido:
  - `http://127.0.0.1:3001/healthz`
  - `http://127.0.0.1:3000/healthz`
  - `http://127.0.0.1:5678/healthz`

Se importaron workflows con `active=false`. No se activaron workflows durante la validacion automatica para evitar ejecuciones contra Binance.

## Checklist antes de operar

- Cambiar `N8N_ENCRYPTION_KEY` antes de crear credenciales finales.
- Rotar claves Binance/Anthropic/Telegram encontradas en exports historicos.
- Importar workflows.
- Reasignar credenciales.
- Ejecutar pruebas con testnet o trading deshabilitado.
- Confirmar que `SL Monitor` responde antes de activar el bot principal.
- Confirmar que `Operations Executor` fue recuperado o que el flujo actual no lo necesita.
