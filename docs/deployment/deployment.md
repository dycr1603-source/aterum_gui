# Despliegue

## Telegram Copilot

El sidecar usa `aterum-dashboard:local` y monta sus fuentes read-only. El control de coste y latencia depende únicamente de estas variables:

```env
TELEGRAM_CLAUDE_MODEL=claude-haiku-4-5-20251001
TELEGRAM_AI_CACHE_TTL_SECONDS=300
TELEGRAM_AI_MAX_INPUT_CHARS=3000
TELEGRAM_AI_MAX_TOKENS=400
```

Después de cambiar configuración se recrea sólo `telegram_control`. El arranque crea idempotentemente `telegram_ai_usage` y `telegram_ai_cache`; no altera trading ni workflows.

## Acceso publico actual

- URL canonica: `https://aterum.duckdns.org`.
- HTTP redirige a HTTPS.
- Dashboard/API/Chart/n8n directos estan ligados a `127.0.0.1`.
- Certificado Let's Encrypt valido hasta `2026-09-26` y renovacion automatica activa.
- Pendiente externo: permitir TCP/443 en AWS Security Group `sg-033df4fdcfb537e9b`.

La infraestructura final queda en `/home` y arranca con:

```bash
cd /home
docker compose up -d
```

En este servidor la cuenta actual no tiene acceso directo al socket Docker; la validacion se ejecuto con:

```bash
sudo docker compose -f /home/docker-compose.yml up -d --no-build
```

## Archivos generados

- `/home/docker-compose.yml`
- `/home/.env.example`
- `/home/database/schema.sql`
- `/home/nginx/nginx.conf`
- `/home/aterum_gui/Dockerfile`
- `/home/aterum_gui/.dockerignore`
- `/home/docs/architecture/repository-analysis.md`
- `/home/docs/architecture/architecture.md`
- `/home/docs/architecture/workflow-analysis.md`
- `/home/docs/architecture/workflow-vs-code-gap-analysis.md`
- `/home/docs/architecture/missing-components.md`
- `/home/docs/operations/n8n.md`

## Servicios

- `mysql`: MariaDB 11.4 con schema inicial.
- `redis`: Redis 7.
- `dashboard`: backend/dashboard en `3001`.
- `aterum_gui`: chart API en `3000`.
- `n8n`: workflows en `5678`.
- `nginx`: proxy TLS en `80/443`.
- `telegram_control`: centro de operaciones Telegram multiusuario con RBAC, sin puerto publico.

## Puertos

- `http://127.0.0.1:80` -> redireccion nginx.
- `https://aterum.duckdns.org` -> entrada publica nginx.
- `http://127.0.0.1:3001` -> dashboard/API.
- `http://127.0.0.1:3000` -> chart API.
- `http://127.0.0.1:5678` -> n8n.

## Variables `.env`

Crear `.env` desde `.env.example`:

```bash
cd /home
cp .env.example .env
```

Variables criticas:

- `APP_DOMAIN`
- `MYSQL_ROOT_PASSWORD`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `SESSION_SECRET`
- `DEFAULT_ADMIN_USER`
- `DEFAULT_ADMIN_PASSWORD`
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `TELEGRAM_ALLOWED_USER_IDS`

`TELEGRAM_ALLOWED_USER_IDS` se usa únicamente para sembrar administradores. Los demás miembros del grupo se registran como viewer en `telegram_users`.
- `N8N_ENCRYPTION_KEY`
- `WEBHOOK_URL`
- `SIMULATOR_POLICY_KEY`

No usar valores historicos embebidos en exports. Rotar antes de produccion.

## Orden de despliegue

1. Configurar `.env`.
2. Construir/levantar:

```bash
docker compose up -d --build
```

Para un cambio de dominio o proxy sobre imagenes ya construidas usar `docker compose up -d --force-recreate dashboard aterum_gui n8n nginx`; no reconstruir imagenes.

3. Verificar servicios:

```bash
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:5678/healthz
curl http://127.0.0.1:3001/db/stats
curl http://127.0.0.1:3001/cb/status
curl http://127.0.0.1:3001/cooldown/status
```

4. Importar workflows n8n.
5. Reasignar credenciales.
6. Validar webhooks `SL Monitor`.
7. Activar workflows en orden.

## Validacion realizada

Stack levantado correctamente con:

```text
mysql: healthy
redis: healthy
dashboard: healthy
aterum_gui: up
n8n: up
nginx: up
```

Pruebas ejecutadas:

- `GET /healthz` dashboard -> OK.
- `GET /healthz` chart API -> OK.
- `GET /healthz` n8n -> OK.
- `GET /healthz` via nginx -> OK.
- `GET /cb/status` -> OK.
- `GET /cooldown/status` -> OK.
- `GET /db/stats` -> OK.
- `GET /api/simulator/policy?limit=10&hours=1&key=aterum_policy_v1` -> OK.
- MySQL `SHOW TABLES` -> tablas y vistas creadas.
- Prueba interna desde namespace compartido a `127.0.0.1:3001`, `127.0.0.1:3000`, `127.0.0.1:5678` -> OK.
- Workflows n8n importados con `active=0`: `Advanced AI Trading Bot v2 - Clean`, `SL Monitor`, `Trailing Manager`.

No se ejecutaron ordenes reales de Binance.

## Backup strategy

Respaldar al menos:

- Volumen `home_mysql_data`.
- Volumen `home_n8n_data`.
- Volumen `home_dashboard_data`.
- Archivo `/home/.env`.
- Exports de workflows n8n.
- `/home/database/schema.sql`.

Backup MySQL:

```bash
docker compose exec -T mysql mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" trading_bot > backup-trading_bot.sql
```

Backup workflows n8n desde UI o CLI:

```bash
docker compose exec -T n8n n8n export:workflow --all --output=/home/node/.n8n/workflows-export.json
docker cp "$(docker compose ps -q n8n)":/home/node/.n8n/workflows-export.json ./workflows-export.json
```

Backup volumenes:

```bash
docker run --rm -v home_mysql_data:/data -v "$PWD":/backup alpine tar czf /backup/mysql_data.tgz -C /data .
docker run --rm -v home_n8n_data:/data -v "$PWD":/backup alpine tar czf /backup/n8n_data.tgz -C /data .
docker run --rm -v home_dashboard_data:/data -v "$PWD":/backup alpine tar czf /backup/dashboard_data.tgz -C /data .
```

Guardar backups cifrados fuera del host.

## Recovery strategy

1. Clonar/restaurar `/home` con Compose, nginx, schema y repos.
2. Restaurar `.env` con los mismos secretos.
3. Levantar solo MySQL:

```bash
docker compose up -d mysql
```

4. Restaurar dump:

```bash
docker compose exec -T mysql mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" trading_bot < backup-trading_bot.sql
```

5. Restaurar volumen n8n o importar workflows exportados.
6. Levantar stack completo:

```bash
docker compose up -d
```

7. Verificar healthchecks.
8. Verificar `SL Monitor` antes de activar el bot principal.

## Notas operativas

- En entorno limpio, `docker compose up -d --build` construye la imagen `aterum-dashboard:local`.
- `dashboard`, `aterum_gui` y `n8n` comparten red intencionalmente para respetar URLs historicas localhost.
- La plantilla `/home/nginx/nginx.conf` y Compose derivan todas las URLs desde `APP_DOMAIN`; para migrar se cambia esa unica variable, se emite el certificado y se recrean n8n/nginx.
- Si se cambia `DB_NAME`, ajustar tambien `database/schema.sql`, porque el init SQL usa `trading_bot` por defecto.
- Para pruebas sin ejecucion real, mantener workflows inactivos o usar credenciales testnet.
