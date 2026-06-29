# SSL y Let's Encrypt

## Certificado actual

- Dominio: `aterum.duckdns.org`.
- Emisor: Let's Encrypt.
- Ruta: `/etc/letsencrypt/live/aterum.duckdns.org/`.
- Expiracion: `2026-09-26`.
- Metodo: HTTP-01 webroot en `/home/certbot/www`.

## Renovacion

`certbot.timer` esta habilitado y activo. El hook `/etc/letsencrypt/renewal-hooks/deploy/reload-aterum-nginx.sh` recarga nginx despues de una renovacion.

Prueba ejecutada:

```bash
sudo certbot renew --dry-run --no-random-sleep-on-renew
```

Resultado: renovacion simulada correcta.

## Verificacion

```bash
sudo certbot certificates
systemctl status certbot.timer
curl -I https://aterum.duckdns.org/healthz
```

No usar certificados autofirmados y no copiar `privkey.pem` al repositorio.

