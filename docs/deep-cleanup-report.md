# Deep cleanup report

Fecha: 2026-06-23 UTC

## Estado inicial

- Disco raiz antes de limpieza profunda final: 69 MB libres, 100% usado.
- Docker antes de pruning: imagenes activas y no activas ocupando alrededor de 2.99 GB.
- Directorios grandes detectados:
  - `/var/lib/docker`: 4.1 GB
  - `/home/admin/.vscode-server`: 1.2 GB
  - `/var/cache/apt`: 92 MB

## Eliminado

- Imagenes Docker no utilizadas mediante:
  - `docker image prune -a -f`
  - `docker builder prune -a -f`
  - `docker container prune -f`
  - `docker network prune -f`
- Caches de apt:
  - `/var/cache/apt/archives/*`
  - `/var/lib/apt/lists/*`
  - `apt-get clean`
- Logs y temporales:
  - logs JSON de Docker truncados
  - perfiles temporales de Chromium/Puppeteer en `/tmp`
  - cache Node en `/tmp/node-compile-cache`
  - HTML/JSON/cookies temporales generados para pruebas
  - imagenes temporales `/tmp/*.jpg`, `/tmp/*.png`, `/tmp/*.webp`
- Capturas generadas en documentacion:
  - `/home/docs/*before*.png`
  - `/home/docs/*after*.png`
  - `/home/docs/n8n-ui-after.png`
- Caches de VS Code que no forman parte del proyecto:
  - `CachedExtensionVSIXs`
  - `logs`
  - `History`
  - `workspaceStorage`
  - `CachedProfilesData`
- Extension no usada por el stack:
  - `anthropic.claude-code-2.1.186-linux-x64`
- Artefacto local no usado:
  - `/home/aterum_gui/views/simulator.js.backup`

## Conservado intencionalmente

- Repositorios:
  - `/home/aterum_gui`
  - `/home/n8nTradeSkill`
- Workflows historicos JSON en `/tmp`:
  - `Advanced AI Trading Bot v2 - Clean (13).json`
  - `SL Monitor (6).json`
  - `Trailing Manager (3).json`
- Volumenes Docker:
  - `home_mysql_data`
  - `home_n8n_data`
  - `home_redis_data`
  - `home_dashboard_data`
- Configuracion:
  - `/home/docker-compose.yml`
  - `/home/nginx`
  - `/home/.env`
  - `/home/database/schema.sql`
- Imagenes Docker activas:
  - `aterum-n8n-compat:local`
  - `aterum-dashboard:local`
  - `mariadb:11.4`
  - `redis:7-alpine`
  - `nginx:1.27-alpine`

## Estado final

- Disco raiz: 485 MB libres, 94% usado.
- Docker:
  - 5 imagenes activas
  - 6 contenedores activos
  - 4 volumenes activos
  - build cache: 0 B

## Validacion

- `mysql`: healthy
- `redis`: healthy
- `dashboard`: healthy
- `aterum_gui`: healthy
- `n8n`: up
- `nginx`: up
- `http://127.0.0.1:3001/healthz`: `{"ok":true,"service":"aterum-dashboard"}`
- `http://127.0.0.1:5678/`: HTTP 200
- Generacion de chart desde n8n validada:
  - comando: `curl -m 30 "http://localhost:3000/chart?symbol=SPCXUSDT" -o /tmp/chart.jpg`
  - resultado: JPG creado correctamente

## Observacion

El espacio restante esta dominado por componentes activos:

- `/var/lib/docker`: 4.1 GB, contiene imagenes y volumenes en uso.
- `/home/admin/.vscode-server`: 920 MB, contiene la sesion activa de VS Code/Codex.

Borrar esas rutas completas liberaria mas espacio, pero detendria o romperia servicios activos o la sesion administrativa actual.
