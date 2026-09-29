# Control de Aterum y cambio de PC

El control opera sobre el Compose existente, con perfiles `trading`, `ai` y `aux`. No cambia `.env`, límites de riesgo, workflows ni órdenes de Binance. El estado de control vive **fuera del repositorio**, en `~/.local/state/aterum-control/`, con permisos restrictivos. No copies `host.json` ni `inhibited` a otra PC: son el estado de este host.

## Instalar en cada PC

Desde `/home/<usuario>/projects/aterum/aterum_gui`:

```bash
./scripts/install-host-control.sh
~/.local/bin/aterum status
```

El instalador no arranca ni detiene contenedores. Instala el comando `~/.local/bin/aterum`, la unidad `aterum-stack@<usuario>.service` y la condición de bloqueo del túnel. Requiere Node 22 en `/usr/bin/node`, systemd, Docker y Compose. Configura un permiso sudo limitado a iniciar/detener el túnel de ese usuario. Reemplaza el arranque mediante una unidad antigua `aterum-stack.service` deshabilitándola, sin detenerla durante la instalación.

También puede ejecutarse como root: obtiene el usuario de la ruta `/home/<usuario>/projects/aterum/aterum_gui` y crea el comando/estado bajo ese usuario. Los comandos cotidianos deben ejecutarse como ese usuario, no como root. Las rutas `/ruta/...` de los ejemplos deben sustituirse por archivos realmente transferidos; el instalador no descarga un parche de la PC original.

Si detecta una instalación ya operativa, registra `ACTIVE`. Una PC nueva se registra `STOPPED` y bloqueada. La tarea de Windows debe iniciar WSL y dejar el arranque a systemd; no debe ejecutar otro `docker compose up` directamente.

## Comandos

```bash
# Ver el estado real de contenedores y el bloqueo de este host.
~/.local/bin/aterum status

# Detener todo y conservar el bloqueo después de reiniciar Windows.
~/.local/bin/aterum stop

# Reanudar explícitamente esta PC tras un stop normal.
~/.local/bin/aterum start

# Detener y retirar esta PC para transferir la instalación a otra.
~/.local/bin/aterum migrate
```

Puede usarse `aterum` sin ruta si `~/.local/bin` está en PATH. Sin instalador, el equivalente es `node scripts/aterum-control.js <comando>` desde el proyecto.

`stop`/`migrate` detienen el túnel y consumidor Telegram, después n8n y Position Guard, mientras Dashboard y bases siguen disponibles para verificar ejecuciones pendientes. Detienen los demás servicios y finalmente Redis/MariaDB, conservando contenedores y volúmenes. Docker recibe `stop --timeout -1`: el controlador no impone SIGKILL para cerrar una orden en curso. n8n tiene un plazo interno configurable (`N8N_GRACEFUL_SHUTDOWN_TIMEOUT`, por defecto 300 segundos en el Compose actualizado); un cierre forzado/no limpio o tareas pendientes impide certificar la migración.

Position Guard espera las solicitudes HTTP, scans, operaciones de ejecución y persistencia en curso antes de cerrar su conexión a MariaDB. Las señales repetidas no repiten el cierre. Este comportamiento y el plazo nuevo de n8n entran en vigor cuando esos contenedores utilicen el código/Compose actualizado; instalar el comando no reinicia sus procesos.

Un `stop` normal permite `start`. Una PC `RETIRED` rechaza `start` hasta una reactivación explícita. El bloqueo persiste entre reinicios y evita el arranque por estas unidades. Un operador que ejecute Docker directamente puede eludirlo: no constituye un bloqueo distribuido sobre Binance.

## Cambiar de PC

1. Prepara/restaura inicialmente la nueva PC con ejecución y consumidores bloqueados. Transfiere este código y construye las imágenes actualizadas.
2. En la PC original ejecuta `aterum migrate`. Solo continúa si termina correctamente y `aterum status` indica `migrationReady: true`, `RETIRED` y ningún contenedor activo.
3. Con todo detenido, genera los respaldos finales consistentes de MariaDB, n8n, Dashboard, Redis y `.env`, y transfiérelos cifrados. El comando de control **no crea ni transfiere esos respaldos**.
4. Transfiere también `~/.local/state/aterum-control/handoff.json`. Es una constancia sin secretos; no transfieras los otros archivos de estado del host.
5. Restaura los datos finales en la PC nueva conservando `N8N_ENCRYPTION_KEY`, permisos e IDs. Confirma que la PC original siga detenida. En la nueva:

   ```bash
   cd /home/saitama/projects/aterum/aterum_gui
   ./scripts/install-host-control.sh
   ~/.local/bin/aterum start --handoff /ruta/al/handoff.json
   ~/.local/bin/aterum status
   ```

El arranque verifica salud de MariaDB/Redis, luego Dashboard/Chart/adapter/Position Guard, después n8n, Telegram/nginx y finalmente solicita el arranque del túnel. Si falla, intenta detener la instalación parcial y deja el bloqueo. Los workflows mantienen sus flags y horarios reales: `start` puede activar trading en producción.

La constancia no es un lease ni una prueba remota en tiempo real. No impide que alguien reactive después la PC original. Es responsabilidad del cambio de PC mantener una sola instalación operativa. Los SL/TP ya colocados en Binance no se cancelan; mientras Aterum está detenido no se ejecutan los monitores ni el trailing local.

## Volver a la PC original

Primero detén/retira la otra PC y sincroniza su estado final. Solo entonces:

```bash
~/.local/bin/aterum start --reactivate
```

`--first-install` permite registrar explícitamente una instalación independiente existente sin una constancia de otra PC. No usarlo para omitir el cambio controlado de una misma cuenta.

## Arranque de Windows y logs

La unidad de stack se habilita sin iniciarla durante la instalación. Al arrancar WSL ejecuta `start --boot`, que respeta el bloqueo persistente. Un apagado ordinario por systemd usa `stop --shutdown` y conserva la intención de arrancar; `aterum stop` y `migrate` sí dejan la PC inhibida. Suspensión, pérdida de alimentación o cierre forzado de WSL no garantizan un apagado ordenado. No se ha probado un reinicio real de Windows en esta implementación.

```bash
journalctl -u "aterum-stack@$(id -un).service" -f
journalctl -u "aterum-gui-tunnel@$(id -un).service" -f
docker compose --profile trading --profile ai --profile aux logs --tail 100 n8n position_guard
```

Los comandos interactivos muestran su resultado en la terminal. `host.json` guarda el último resultado, errores genéricos y conteos de drenaje, sin credenciales. Si falla la certificación, no actives otra PC hasta revisar los errores y la reconciliación. No existe un modo `force` que certifique tareas pendientes.

Una carpeta `~/.local/state/aterum-control/lock` evita comandos simultáneos. Si quedó después de matar el proceso, comprueba primero que ningún controlador siga corriendo y después elimina únicamente esa carpeta vacía. No borres `inhibited` para saltar la retirada.

## Verificación

`npm run test:host-control` comprueba el orden del apagado, bloqueo tras reinicio, retiro, constancia entre hosts, rechazo de tareas pendientes y cierre no limpio, fallo del túnel, reversión de arranque parcial, preservación del arranque ordinario y drenaje del ejecutor. Los comandos mutantes se prueban con Docker/systemd simulados: no detienen el trading actual ni envían órdenes.

Se instaló el control en la PC original de `delcon` sin reiniciar sus contenedores. El comando real `status` confirmó `ACTIVE`, nueve servicios saludables y ningún bloqueo. La lectura real del estado de n8n/MariaDB funcionó. Pasaron el build, las pruebas de ejecución y los 37 archivos de pruebas offline (incluida esta nueva suite), la validación de Compose y de las unidades systemd. Se construyó la imagen actualizada del Dashboard para su siguiente arranque. No se ejecutaron `stop`, `migrate`, `start` ni un reinicio de Windows contra producción.

### Primer retiro real: 29 de septiembre de 2026

El usuario ejecutó `migrate`. El proceso esperó indefinidamente al adaptador Python: su proceso PID 1 no manejaba SIGTERM. Se le envió SIGINT, que Python sí maneja; el apagado continuó sin reactivar trading ni monitores. El controlador ahora muestra pasos de progreso y envía SIGINT al adaptador antes del stop grupal. `typesafe-adapter/service.py` maneja SIGTERM/SIGINT y espera sus handlers antes de salir; un contenedor de prueba aislado y sin red terminó con código 0 al recibir el stop normal de Docker.

El chequeo de drenaje detectó también una solicitud `OPEN_POSITION` de ARBUSDT del 25 de septiembre, `061f14b5-bf1a-d35d-c580-9a87575cce08`, todavía marcada EXECUTING sin respuesta ni recibo de Binance. Se inició solo MariaDB para auditarla. La [consulta por identificador](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Query-Order) respondió -2013, el historial devuelto desde su fecha contenía una orden de otro identificador y no había trades locales vinculados a esa ejecución. No se interpretó un -2013 aislado como evidencia suficiente: se contrastó el historial completo de esa ventana.

`scripts/reconcile-stale-open.js` realizó esas consultas exclusivamente GET y, con `--apply`, registró FAILED y un evento de auditoría dentro de una transacción. No llamó al ejecutor ni envió/canceló órdenes. Se conservó la posición ARBUSDT posterior, vinculada a otra ejecución.

El controlador permite repetir la comprobación con un contenedor efímero que solo lee SQLite/MariaDB cuando Dashboard ya está detenido. Tras esta corrección se repitió `migrate`: drenaje workflows=0/executions=0, nueve servicios detenidos, ngrok inactivo, `RETIRED`, bloqueo persistente y `migrationReady=true`. La constancia quedó en `/home/delcon/.local/state/aterum-control/handoff.json`. MariaDB también quedó detenida al terminar. No se reinició Windows.

La constancia certifica el retiro local; **todavía faltan los respaldos finales y su restauración en la PC nueva**.
