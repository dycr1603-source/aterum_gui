# Migracion DuckDNS y HTTPS

Fecha: 2026-06-28

## Resultado

La infraestructura de Aterum fue migrada de URLs publicas por IP a `https://aterum.duckdns.org`. No se modificaron workflows, datos, reglas ni codigo de trading.

El servidor, certificado, nginx y aplicaciones estan configurados. El acceso HTTPS desde Internet permanece bloqueado hasta agregar TCP/443 al Security Group AWS `sg-033df4fdcfb537e9b`.

## Cambios runtime

- `/home/docker-compose.yml`: puerto 443, certificados, plantilla nginx, variables publicas y binds loopback.
- `/home/.env`: dominio, URLs HTTPS, n8n HTTPS y cookie segura.
- `/home/.env.example`: contrato de variables actualizado.
- `/home/nginx/nginx.conf`: TLS, redirect, rutas, WebSocket y headers.
- `/home/certbot/reload-aterum-nginx.sh`: recarga tras renovacion.
- `/etc/letsencrypt/renewal-hooks/deploy/reload-aterum-nginx.sh`: hook instalado.

## Certificado

- CN/SAN: `aterum.duckdns.org`.
- Emisor: Let's Encrypt `YE1`.
- Validez: `2026-06-28` a `2026-09-26`.
- Renovacion: `certbot.timer` activo.
- `certbot renew --dry-run`: correcto.

## n8n

```env
N8N_HOST=aterum.duckdns.org
N8N_PROTOCOL=https
WEBHOOK_URL=https://aterum.duckdns.org/
N8N_EDITOR_BASE_URL=https://aterum.duckdns.org/n8n/
N8N_SECURE_COOKIE=true
```

`/rest/settings` confirmo `authCookie.secure=true`. Existen cuatro webhooks registrados; no se invocaron para evitar ejecutar logica productiva.

## Seguridad

- HTTP devuelve `301` hacia el dominio HTTPS.
- HSTS por un ano.
- X-Frame-Options, X-Content-Type-Options, Referrer-Policy y Permissions-Policy activos.
- Puertos 3000, 3001 y 5678 ligados a `127.0.0.1`.
- MariaDB y Redis no se reiniciaron.

## Pruebas TLS locales con dominio real

| Ruta | Resultado |
|---|---|
| `/` | `302 /dashboard` |
| `/dashboard` | `200` autenticado |
| `/research` | `200` autenticado |
| `/analytics` | `200` autenticado |
| `/news` | `200` autenticado |
| `/simulator` | `200` autenticado |
| `/ai-data` | `200` autenticado |
| `/n8n/` | `200` |
| `/api` | `200` |
| `/api/research/summary` | `200` |
| `/healthz` | `200` |

Compose reporto `healthy` para MySQL, Redis, Dashboard, n8n y nginx. GUI/Chart permanecio `up`.

## Bloqueo AWS

DNS resuelve correctamente a `15.228.159.246`. HTTP publico llega al host y redirige; HTTPS publico expira antes de nginx. nginx escucha `0.0.0.0:443`, por lo que la causa aislada es el Security Group.

Agregar en AWS EC2, region `sa-east-1`, instancia `i-008bf27957ddea133`, Security Group `sg-033df4fdcfb537e9b`:

```text
Type: HTTPS
Protocol: TCP
Port: 443
Source: 0.0.0.0/0
```

La instancia no tiene rol IAM y AWS CLI no dispone de credenciales, por lo que esa regla no pudo aplicarse desde el host.

## Migracion futura

Para `aterum.ai` o `aterum.app`: apuntar DNS, emitir el certificado, cambiar unicamente `APP_DOMAIN` en `.env` y recrear n8n/nginx. Compose deriva todas las URLs y la plantilla nginx no cambia.
