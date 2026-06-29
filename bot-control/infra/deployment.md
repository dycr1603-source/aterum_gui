# Deployment

## Arranque

```bash
cd /home
sudo docker compose config --quiet
sudo docker compose up -d
sudo docker compose ps
```

No se necesita reconstruir imagenes para cambiar dominio, certificados o nginx.

## Requisitos externos

1. El registro DNS debe apuntar a la IP elastica/publica.
2. AWS Security Group debe permitir TCP/80 y TCP/443.
3. `/home/.env` debe contener el bloque de URLs publicas.
4. Debe existir `/etc/letsencrypt/live/$APP_DOMAIN/`.

## Cambiar a aterum.ai o aterum.app

1. Apuntar el DNS nuevo a la IP publica.
2. Emitir el certificado nuevo:

```bash
sudo certbot certonly --webroot -w /home/certbot/www -d NUEVO_DOMINIO
```

3. Cambiar solamente `APP_DOMAIN` en `/home/.env`. Compose deriva todas las URLs publicas y variables n8n.
4. Recrear n8n y nginx:

```bash
sudo docker compose up -d --force-recreate n8n nginx
```

La plantilla nginx obtiene el dominio mediante `APP_DOMAIN`; no requiere editar rutas.
