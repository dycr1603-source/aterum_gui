# n8n Recovery Report

Fecha: 2026-06-22

## Causa raiz

n8n estaba activo como proceso, pero no era accesible correctamente porque escuchaba en IPv6 (`::`) dentro del namespace compartido con `dashboard`, mientras nginx y el puerto publicado intentaban conectar por IPv4.

Sintomas observados:

- `http://15.229.49.86:5678/` no conectaba.
- `http://15.229.49.86/n8n/` devolvia `502 Bad Gateway`.
- `docker ps` mostraba `home-n8n-1` como `Up`.
- `/proc/net/tcp6` mostraba n8n escuchando en `:5678`; nginx resolvia `dashboard:5678` por IPv4.

## Correccion aplicada

Archivo modificado:

- `/home/docker-compose.yml`

Variable agregada:

```env
N8N_LISTEN_ADDRESS=0.0.0.0
```

Reinicio realizado:

```bash
docker compose -f /home/docker-compose.yml up -d --force-recreate n8n
docker compose -f /home/docker-compose.yml restart n8n
```

Nota operativa: como n8n usa `network_mode: service:dashboard`, si se reinicia `dashboard`, n8n debe reiniciarse despues para recuperar el socket en el namespace compartido.

## Credenciales corregidas

Se detectaron referencias rotas en nodos Telegram:

- `SL Monitor / Telegram: SL Updated`
- `SL Monitor / Telegram: Post-Trade Agent`
- `Trailing Manager / Telegram: SL Updated`

Se reasignaron a la credencial valida:

- `Telegram account` (`telegramApi`)

Tambien se recupero una credencial historica faltante:

- `SSH Password account` (`sshPrivateKey`)

Esto elimina referencias inexistentes en workflows importados sin modificar la logica de trading.

## Validacion

Accesos HTTP:

- `http://15.229.49.86:5678/` responde `200 OK`.
- `http://15.229.49.86/n8n/` responde `200 OK`.

Workflows visibles por API n8n:

- `SL Monitor` active=true
- `Trailing Manager` active=true
- `Advanced AI Trading Bot v2 - Clean` active=true
- `Recommendation Review Engine` active=true
- `Telemetry Persistence Webhook` active=false
- `Telemetry Persistence Test` active=false

Credenciales visibles:

- `Telegram account` type=`telegramApi`
- `Telegram account 2` type=`telegramApi`
- `SSH Password account` type=`sshPrivateKey`

Ejecuciones recientes:

- ultimas ejecuciones visibles en `/rest/executions`
- estados recientes: `success`

Captura:

- `/home/docs/n8n-ui-after.png`

