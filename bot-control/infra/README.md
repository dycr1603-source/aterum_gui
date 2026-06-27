# Infraestructura de referencia

Esta carpeta contiene una version autocontenida del stack para este repositorio:

- `docker-compose.example.yml`
- `database/schema.sql`
- `nginx/nginx.conf`
- `n8n-compat/Dockerfile`
- `n8n-compat/curl-shim.js`
- `.env.example`

## Despliegue

Desde la raiz del repositorio:

```bash
cp bot-control/infra/.env.example .env
# completar todas las variables requeridas
docker compose \
  --env-file .env \
  -f bot-control/infra/docker-compose.example.yml \
  up -d --build
```

Validar:

```bash
docker compose --env-file .env -f bot-control/infra/docker-compose.example.yml ps
curl -f http://127.0.0.1/healthz
curl -f http://127.0.0.1/n8n/
```

## Alcance

El Compose conserva la topologia de produccion, pero no contiene volumenes ni datos reales. Los secretos son obligatorios y Compose falla antes de arrancar si faltan. `N8N_TRADING_DISABLED=1` es el valor seguro inicial; cambiarlo solo despues de importar, revisar y validar workflows.

Los archivos de `/home` siguen siendo la configuracion runtime autoritativa del servidor actual. Este ejemplo permite reconstruir el stack desde Git sin modificar esa instalacion.
