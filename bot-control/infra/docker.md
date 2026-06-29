# Docker

## Servicios

| Servicio | Imagen | Persistencia |
|---|---|---|
| `mysql` | `mariadb:11.4` | `mysql_data` |
| `redis` | `redis:7-alpine` | `redis_data` |
| `dashboard` | `aterum-dashboard:local` | `dashboard_data`, n8n read-only |
| `aterum_gui` | `aterum-dashboard:local` | namespace de dashboard |
| `n8n` | `aterum-n8n-compat:local` | `n8n_data` |
| `telegram_control` | `aterum-dashboard:local` | n8n read-only + `telegram_users`/`telegram_audit` |
| `nginx` | `nginx:1.27-alpine` | certificados read-only, webroot ACME |

## Cambios de acceso

Para cambios de dominio o proxy no usar `docker compose build`. Recrear sólo los servicios afectados:

```bash
sudo docker compose up -d --force-recreate dashboard aterum_gui n8n nginx
```

MariaDB y Redis no se reinician. Los volumenes no se eliminan.

Telegram Control se levanta de forma independiente y no requiere build:

```bash
sudo docker compose up -d telegram_control
```

## Health

```bash
sudo docker compose ps
curl -f http://127.0.0.1:3001/healthz
curl -f http://127.0.0.1:5678/healthz
curl --resolve "$APP_DOMAIN:443:127.0.0.1" -f "https://$APP_DOMAIN/healthz"
```
