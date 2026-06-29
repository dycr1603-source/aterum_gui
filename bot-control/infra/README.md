# Infraestructura de Aterum

La entrada publica canonica es `https://aterum.duckdns.org`. nginx termina TLS y conserva los contratos internos historicos de n8n en `127.0.0.1`.

## Documentos

- [deployment.md](./deployment.md): despliegue y migracion de dominio.
- [network.md](./network.md): puertos, DNS, Security Group y rutas.
- [reverse-proxy.md](./reverse-proxy.md): comportamiento de nginx.
- [environment.md](./environment.md): variables publicas e internas.
- [ssl.md](./ssl.md): Let's Encrypt y renovacion.
- [docker.md](./docker.md): servicios, volumenes y recreacion segura.
- [architecture.md](./architecture.md): diagramas de la topologia TLS.

## Fuentes versionadas

- `docker-compose.example.yml`
- `.env.example`
- `nginx/nginx.conf`
- `database/schema.sql`
- `n8n-compat/`

Los archivos runtime autoritativos del servidor son `/home/docker-compose.yml`, `/home/.env` y `/home/nginx/nginx.conf`. Los certificados y secretos no se versionan.

## Estado 2026-06-28

- DNS: `aterum.duckdns.org -> 15.228.159.246`.
- Certificado Let's Encrypt emitido y valido hasta `2026-09-26`.
- HTTP redirige a HTTPS.
- Dashboard, n8n, nginx, MariaDB y Redis saludables.
- TCP/443 escucha en el host, pero el Security Group `sg-033df4fdcfb537e9b` debe permitir ingreso desde Internet para completar el acceso externo.
