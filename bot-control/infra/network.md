# Network

## Exposicion

| Puerto | Bind | Uso |
|---|---|---|
| 80 | `0.0.0.0` | ACME y redireccion a HTTPS |
| 443 | `0.0.0.0` | Entrada publica TLS |
| 3000 | `127.0.0.1` | Chart API local |
| 3001 | `127.0.0.1` | Dashboard/API local |
| 5678 | `127.0.0.1` | n8n local |
| 3306 | red Docker | MariaDB |
| 6379 | red Docker | Redis |

Los puertos de aplicacion no son accesibles directamente desde Internet. nginx es la unica entrada publica.

## AWS

- Region: `sa-east-1`.
- Instancia: `i-008bf27957ddea133`.
- Security Group: `sg-033df4fdcfb537e9b`.
- Regla necesaria: inbound TCP/443 desde `0.0.0.0/0` y, si se usa IPv6, `::/0`.

La instancia no tiene rol IAM asociado; el Security Group debe modificarse desde una sesion AWS autorizada.

## Rutas

| Ruta | Destino |
|---|---|
| `/`, `/dashboard`, `/analytics`, `/research`, `/simulator`, `/ai-data` | Dashboard `:3001` |
| `/news` | Vista existente `/ai-data` que contiene noticias |
| `/api` | Health del Dashboard |
| `/api/*` | Dashboard API `:3001` |
| `/chart*` | Chart API `:3000` |
| `/n8n/`, `/rest/`, `/assets/`, `/static/` | n8n `:5678` |
| `/webhook/*`, `/webhook-test/*`, `/webhook-waiting/*` | webhooks n8n |
| `/ws` | WebSocket Dashboard |

