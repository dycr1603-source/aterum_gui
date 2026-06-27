# Public IP Update

Fecha: 2026-06-24 UTC

## Cambio detectado

La IP pública anterior `15.229.49.86` dejó de responder desde el host.

La IP pública real actual es:

```text
15.228.159.246
```

## Variables actualizadas

Archivo modificado:

```text
/home/.env
```

Valores finales:

```env
N8N_HOST=15.228.159.246
WEBHOOK_URL=http://15.228.159.246/
N8N_EDITOR_BASE_URL=http://15.228.159.246/n8n/
N8N_SECURE_COOKIE=false
```

## Reinicio realizado

Se recrearon únicamente:

```bash
docker compose up -d --force-recreate n8n nginx
```

## Validación

```text
http://15.228.159.246/dashboard -> 200
http://15.228.159.246/n8n/ -> 200
http://15.228.159.246/api/dashboard/state -> 200
```

Estado Docker final:

```text
home-nginx-1 healthy
home-n8n-1 healthy
home-aterum_gui-1 healthy
home-dashboard-1 healthy
home-redis-1 healthy
home-mysql-1 healthy
```

## Nota

Los documentos históricos pueden mencionar `15.229.49.86`; esa IP ya no debe usarse para acceso operativo actual.
