# Reverse Proxy

La configuracion runtime esta en `/home/nginx/nginx.conf`. Compose la monta como `/etc/nginx/templates/default.conf.template`; el entrypoint oficial de nginx reemplaza `APP_DOMAIN` al iniciar.

## Comportamiento

- Puerto 80 conserva `/.well-known/acme-challenge/` y redirige el resto a HTTPS.
- Puerto 443 termina TLS y envia `X-Forwarded-Proto=https` y `X-Forwarded-Port=443`.
- n8n conserva `/n8n/` como URL publica y se sirve internamente desde `/`.
- WebSockets y conexiones largas desactivan buffering y usan timeout de una hora.
- El indice `/api` reutiliza `/healthz`; `/api/*` conserva sus contratos originales.

## Headers

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Validar antes de recrear:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --force-recreate --no-deps nginx
sudo docker compose ps nginx
```

