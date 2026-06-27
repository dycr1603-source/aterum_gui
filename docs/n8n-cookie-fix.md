# n8n cookie fix

Fecha: 2026-06-21.

## Problema

n8n mostraba:

```text
Your n8n server is configured to use a secure cookie...
```

El acceso actual es HTTP por IP publica:

```text
http://15.229.49.86/n8n/
```

No hay TLS/HTTPS todavia, por lo que una cookie marcada `Secure` no funciona en navegador.

## Cambio aplicado

Archivos modificados:

- `/home/.env`
- `/home/.env.example`
- `/home/docker-compose.yml`

Variables aplicadas:

```env
N8N_HOST=15.229.49.86
N8N_PROTOCOL=http
WEBHOOK_URL=http://15.229.49.86/
N8N_EDITOR_BASE_URL=http://15.229.49.86/n8n/
N8N_PROXY_HOPS=1
N8N_SECURE_COOKIE=false
```

Tambien se sincronizo el archivo persistente del volumen n8n:

```text
/var/lib/docker/volumes/home_n8n_data/_data/config
```

con la nueva `N8N_ENCRYPTION_KEY`.

## Reinicio realizado

Se recreo n8n y luego el stack completo para tomar las nuevas variables:

```bash
docker compose -f /home/docker-compose.yml up -d --force-recreate n8n
docker compose -f /home/docker-compose.yml up -d --force-recreate mysql redis dashboard aterum_gui n8n nginx
```

## Resultado

Validado:

- n8n arranca correctamente.
- n8n publica editor en `http://15.229.49.86/n8n`.
- `POST /rest/login` devuelve `200 OK`.
- `Set-Cookie: n8n-auth=...` no incluye atributo `Secure`.
- `http://15.229.49.86/n8n/` carga la UI de n8n.

## Nota temporal

Cuando exista dominio con HTTPS valido:

```env
N8N_SECURE_COOKIE=true
WEBHOOK_URL=https://DOMINIO/
N8N_EDITOR_BASE_URL=https://DOMINIO/n8n/
```

y configurar TLS correctamente en nginx.
