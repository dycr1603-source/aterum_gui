# Validacion de acceso

Fecha: 2026-06-21.

## Servicios

`docker compose ps`:

| Servicio | Estado |
| --- | --- |
| mysql | healthy |
| redis | healthy |
| dashboard | healthy |
| aterum_gui | up |
| n8n | up |
| nginx | up |

## MySQL

Validado con nuevas credenciales:

```text
root -> OK
tradingbot -> OK
```

Credenciales antiguas rechazadas:

```text
root_change_me -> Access denied
TradingBot2024! -> Access denied
```

## Redis

Validado:

```text
redis-cli -a REDIS_PASSWORD ping -> PONG
redis-cli ping sin password -> NOAUTH Authentication required
```

## Dashboard / GUI

Validado por HTTP publico:

```text
http://15.229.49.86/ -> 302 /dashboard
http://15.229.49.86/api/account -> 200 JSON
```

Login GUI:

| Usuario | Resultado |
| --- | --- |
| admin1 | `POST /login` -> `302 /dashboard`; `GET /dashboard` con cookie -> `200 OK` |
| admin2 | `POST /login` -> `302 /dashboard`; `GET /dashboard` con cookie -> `200 OK` |

## n8n

Configuracion runtime validada:

```text
N8N_HOST=15.229.49.86
N8N_PROTOCOL=http
WEBHOOK_URL=http://15.229.49.86/
N8N_EDITOR_BASE_URL=http://15.229.49.86/n8n/
N8N_PROXY_HOPS=1
N8N_SECURE_COOKIE=false
```

Login n8n:

```text
POST http://15.229.49.86/rest/login -> 200 OK
Set-Cookie n8n-auth sin Secure
```

Admin n8n:

```text
email=admin@aterum.local
role=global:owner
disabled=0
has_password=1
```

## Workflows

Workflows n8n preservados e inactivos:

```text
Advanced AI Trading Bot v2 - Clean active=0
SL Monitor active=0
Trailing Manager active=0
```

No se tocaron workflows, Binance ni ordenes reales.
