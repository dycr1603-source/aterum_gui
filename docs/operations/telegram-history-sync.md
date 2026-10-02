# Historial de Telegram entre las dos PCs

Cada instalación conserva su propia MariaDB. Cuando `aterum migrate` detiene la PC activa, exporta `telegram_audit` y `notification_deliveries`, cifra la instantánea con AES-256-GCM y la publica en la rama separada `aterum-telegram-history`. Solo se publican claves **públicas** y texto cifrado; `.env`, tokens, claves privadas y bases completas no se suben. Cada PC genera una clave privada X25519 local en `~/.local/state/aterum-control/telegram-history-private.pem` con permisos 0600. El archivo cifrado local pendiente queda en ese directorio hasta que el push tenga éxito.

`aterum start` reclama primero el turno en Git, inicia MariaDB y Dashboard e importa todas las instantáneas disponibles **antes** de iniciar n8n y el bot. `update_id` y `event_key` evitan duplicados; importar no reenvía mensajes. En un apagado normal de systemd también se publica una instantánea. Si falla el cifrado, la exportación o Git durante `migrate`, la PC se detiene pero no libera el turno para la otra. Si falla la importación, el arranque se revierte y no se inicia el bot. El límite es 32 MiB de JSON por instantánea; una instantánea mayor falla explícitamente. Para publicar deben estar registradas las claves públicas de **ambas** PCs.

Se sincronizan las consultas que procesó el bot y sus respuestas en `telegram_audit`. Las notificaciones de la otra PC se guardan en `telegram_synced_deliveries`, separadas del registro local `notification_deliveries` que controla duplicados de envío: IDs locales de dos n8n independientes pueden coincidir. Desde esta versión se guarda además el texto de entrada y el texto de las notificaciones enviadas por el servicio de entregas. Los registros anteriores conservan lo que ya estaba en la DB; sus textos faltantes no se pueden reconstruir. Los roles de usuarios, workflows, trades y demás tablas no se sincronizan. Las bases siguen siendo independientes.

La [Bot API de Telegram](https://core.telegram.org/bots/api#getupdates) solo ofrece actualizaciones entrantes pendientes, no un historial completo de mensajes ya consumidos ni los mensajes enviados por el bot. Por eso **no** se consulta el historial de Telegram en cada arranque: se importa el historial persistido por la otra PC y el bot continúa consumiendo las actualizaciones pendientes. No ejecutes dos consumidores del mismo token a la vez.

## Primer traspaso de Saitama a Delcon

Saitama es la PC activa y contiene los registros que faltan en Delcon. Primero, en **Delcon** —aunque esté retirada— registra su clave pública sin arrancar servicios:

```bash
cd /home/delcon/projects/aterum/aterum_gui
git pull --ff-only origin main
node scripts/register-telegram-history.js
```

Después, en Saitama, como el usuario del proyecto:

```bash
cd /home/saitama/projects/aterum/aterum_gui
git pull --ff-only origin main
node scripts/register-telegram-history.js
docker compose --profile trading --profile ai --profile aux build dashboard
aterum migrate
aterum status
git ls-remote --heads origin aterum-telegram-history
```

Continúa solo si `aterum status` indica `RETIRED`, `migrationReady: true`, ningún contenedor en marcha, y la rama cifrada existe. En Delcon:

```bash
cd /home/delcon/projects/aterum/aterum_gui
git pull --ff-only origin main
docker compose --profile trading --profile ai --profile aux build dashboard
aterum start
aterum status
cat ~/.local/state/aterum-control/telegram-history-status.json
```

El último JSON solo contiene hora y conteos importados, sin mensajes. Si falta o se reemplaza la clave privada local, esa PC no podrá descifrar las instantáneas anteriores y el arranque se bloqueará. Conserva esa clave en un respaldo privado de cada PC; no la copies a Git ni al chat. Revisa `journalctl -u "aterum-stack@$(id -un).service" -n 100` o la salida de `aterum start`.
