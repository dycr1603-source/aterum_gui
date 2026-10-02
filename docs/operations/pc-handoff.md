# Control de Aterum y cambio de PC

El historial del bot y las entregas de Telegram se intercambian cifrados durante `migrate`/`start`; consulta [telegram-history-sync.md](telegram-history-sync.md) para el primer traspaso y sus límites.

El control opera sobre el Compose existente, con perfiles `trading`, `ai` y `aux`. No cambia `.env`, límites de riesgo, workflows ni órdenes de Binance. El estado local de control vive en `~/.local/state/aterum-control/`, con permisos restrictivos. Cada PC conserva sus propios volúmenes, base de datos, n8n y `N8N_ENCRYPTION_KEY`; únicamente se fusionan los registros de Telegram descritos arriba.

## Cambio automático mediante Git (vigente)

La coordinación de turno consulta y publica `control.json` en la rama separada `aterum-host-control` del remoto `origin`. La sincronización de Telegram utiliza otra rama y solo contenido cifrado. Ambas usan repositorios temporales aislados: no hacen commits del árbol de trabajo, no suben `.env`, bases completas ni workflows, y no modifican `main` durante el arranque. El push de turno es fast-forward y rechaza reservas simultáneas. No se usan recibos locales antiguos para autorizar arranques automáticos.

Ambas PCs deben actualizar primero el código (`git pull --ff-only origin main`, conservando sus cambios locales). Git debe poder leer y escribir en origin sin preguntas interactivas, también bajo el usuario de systemd. No pongas tokens en la URL del remoto; usa el gestor de credenciales o SSH. Cada operación de Git tiene un límite de 30 segundos. Si falla, no arranca; si falla el push al detener, los servicios quedan detenidos y el turno no se libera: repetir `aterum migrate` cuando vuelva la conexión.

Inicialización: actualizar el código en la PC que está actualmente activa y ejecutar `~/.local/bin/aterum migrate`. Solo un apagado certificado puede crear el estado RELEASED inicial. No inicializar desde una PC antigua retirada si la otra está trabajando. Luego, en la PC de destino, ejecutar `~/.local/bin/aterum start`. No requiere `--handoff` ni `--reactivate`. Para cambios posteriores: `aterum migrate` en la actual y `aterum start` en la siguiente. `stop` también publica la liberación si el apagado se certifica; el apagado ordenado de systemd hace lo mismo. El bloqueo local tras una retirada sigue impidiendo el arranque automático por reinicio.

No se fuerza la toma de control tras suspensión, caída de energía o pérdida de red: Git puede seguir indicando ACTIVE; primero comprobar y detener la PC anterior. No es un lease renovable ni puede detener una PC que alguien arranque directamente con Docker. Protege los cambios cooperativos que usan este comando. La sincronización se limita a los registros de Telegram; no reconcilia el resto de las bases.

La rama `main` distribuye código y definiciones de workflows sin secretos. La rama separada `aterum-host-control` contiene solamente la reserva de turno; `aterum start` ejecuta `gitControl.claim()` antes de iniciar cualquier servicio y `aterum migrate` publica la liberación después del apagado verificado.

## Workflows locales después de cada git pull

Mantén `N8N_TRADING_DISABLED=1` durante la preparación. La `.env` y `.local/workflow-sync.json` son locales e ignorados por Git. `N8N_ENCRYPTION_KEY` y las credenciales deben permanecer en cada PC; `RESEARCH_ANTHROPIC_API_KEY` es opcional porque los nodos de investigación usan `ANTHROPIC_API_KEY` como alternativa.

```bash
docker compose --profile trading --profile ai --profile aux stop n8n telegram_control
npm run workflows:sync -- --publish
```

El instalador importa/actualiza SL Monitor, Trailing Manager, Recommendation Review Engine y el bot principal; asigna la credencial Telegram de este n8n, evita duplicados, rechaza cambios locales no gestionados y comprueba tanto la versión guardada como la publicada. Requiere n8n detenido para tener un único escritor de SQLite. Sin `--publish` guarda los workflows sin activarlos. No inicia servicios ni quita el bloqueo de nuevas entradas.

## Instalar en cada PC

Desde `/home/<usuario>/projects/aterum/aterum_gui`:

```bash
./scripts/install-host-control.sh
~/.local/bin/aterum status
```

El instalador no arranca ni detiene contenedores. Instala el comando `~/.local/bin/aterum`, la unidad `aterum-stack@<usuario>.service` y la condición de bloqueo del túnel. Requiere Node 22 en `/usr/bin/node`, systemd, Docker y Compose. Configura un permiso sudo limitado a iniciar/detener el túnel de ese usuario. Reemplaza el arranque mediante una unidad antigua `aterum-stack.service` deshabilitándola, sin detenerla durante la instalación.

También puede ejecutarse como root: obtiene el usuario de la ruta `/home/<usuario>/projects/aterum/aterum_gui` y crea el comando/estado bajo ese usuario. Los comandos cotidianos deben ejecutarse como ese usuario, no como root.

Si detecta una instalación ya operativa, registra `ACTIVE`. Una PC nueva se registra `STOPPED` y bloqueada. La tarea de Windows debe iniciar WSL y dejar el arranque a systemd; no debe ejecutar otro `docker compose up` directamente.

## Comandos

```bash
# Ver el estado real de contenedores y el bloqueo de este host.
~/.local/bin/aterum status

# Detener todo y conservar el bloqueo después de reiniciar Windows.
~/.local/bin/aterum stop

# Reanudar explícitamente esta PC tras un stop normal.
~/.local/bin/aterum start

# Detener y retirar esta PC para ceder el turno a otra.
~/.local/bin/aterum migrate
```

Puede usarse `aterum` sin ruta si `~/.local/bin` está en PATH. Sin instalador, el equivalente es `node scripts/aterum-control.js <comando>` desde el proyecto.

`stop`/`migrate` detienen el túnel y consumidor Telegram, después n8n y Position Guard, mientras Dashboard y bases siguen disponibles para verificar ejecuciones pendientes. Detienen los demás servicios y finalmente Redis/MariaDB, conservando contenedores y volúmenes. Docker recibe `stop --timeout -1`: el controlador no impone SIGKILL para cerrar una orden en curso. n8n tiene un plazo interno configurable (`N8N_GRACEFUL_SHUTDOWN_TIMEOUT`, por defecto 300 segundos en el Compose actualizado); un cierre forzado/no limpio o tareas pendientes impide certificar la migración.

Position Guard espera las solicitudes HTTP, scans, operaciones de ejecución y persistencia en curso antes de cerrar su conexión a MariaDB. Las señales repetidas no repiten el cierre. Este comportamiento y el plazo nuevo de n8n entran en vigor cuando esos contenedores utilicen el código/Compose actualizado; instalar el comando no reinicia sus procesos.

Un `stop` normal permite `start`. Una PC `RETIRED` puede volver a arrancar solamente si `gitControl.claim()` confirma que el turno está libre; una reserva de la otra PC bloquea el arranque. El bloqueo local persiste entre reinicios y evita el arranque por estas unidades. Un operador que ejecute Docker directamente puede eludirlo: no constituye un bloqueo distribuido sobre Binance.

## Cambiar de PC

1. Actualiza ambas PCs desde `main`. En la PC de destino, configura las credenciales y la clave de n8n locales, construye la imagen Dashboard y sincroniza los workflows con `N8N_TRADING_DISABLED=1`. Confirma que sus consumidores siguen detenidos.
2. En la PC activa, ejecuta `aterum migrate`. Continúa solo si `aterum status` indica `migrationReady: true`, `RETIRED` y ningún contenedor activo. La liberación del turno debe haberse publicado en `aterum-host-control`.
3. En la PC de destino, confirma que Binance no tiene una posición sin STOP nativo y ejecuta `aterum start`. El comando reserva el turno en `aterum-host-control` antes de iniciar servicios. Luego comprueba `aterum status`, los logs de n8n y Position Guard y que haya un solo consumidor Telegram.
4. Mantén `N8N_TRADING_DISABLED=1` hasta completar la comprobación en vivo. Para permitir nuevas entradas después, cambia esa variable **solo en la PC activa** y reinicia n8n.

El arranque verifica salud de MariaDB/Redis, luego Dashboard/Chart/adapter/Position Guard, después n8n, Telegram/nginx y finalmente solicita el arranque del túnel. Si falla, intenta detener la instalación parcial y deja el bloqueo. Los workflows mantienen sus flags y horarios reales: `start` puede activar trading en producción.

No se transfieren volúmenes, bases completas, `.env` ni `handoff.json`; los registros de Telegram viajan cifrados por la rama indicada. Position Guard consulta las posiciones y órdenes abiertas en Binance y adopta en la base local las posiciones que no estén en su historial; con STOP nativo puede publicar su estado a SL Monitor para que Trailing Manager continúe. Si falta el STOP nativo, la configuración actual alerta sin colocar una orden durante la preparación. Los SL/TP ya colocados en Binance no se cancelan; mientras Aterum está detenido no se ejecutan los monitores ni el trailing local.

## Volver a la PC original

Primero retira la PC activa y confirma que el turno quedó libre. Después actualiza código y workflows en la PC de destino:

```bash
~/.local/bin/aterum start
```

Con coordinación Git vigente, `--handoff`, `--first-install` y `--reactivate` no sustituyen la reserva de turno en `aterum-host-control`.

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

Ese retiro es un antecedente histórico. El procedimiento vigente conserva instalaciones y claves independientes y usa la rama `aterum-host-control` para el cambio de turno.

## Antigüedad de posiciones adoptadas y Time Lock

Cuando una PC adopta una posición de Binance sin historial local, Position Guard consulta de forma **solo lectura** las ejecuciones USDⓈ-M de los últimos siete días y reconstruye la apertura de la posición neta por símbolo y lado (LONG/SHORT), incluyendo aumentos y cierres parciales. Si halla la transición verificable de cantidad cero a la posición actual, guarda esa hora como `opened_at` y la publica al SL Monitor. Trailing Manager usa esa hora para `hoursOpen`, por lo que el umbral temporal de Time Lock no empieza de cero al cambiar de PC. No se modifica el SL/TP en esta reconstrucción.

Si el historial está incompleto, saturado (1000 fills) o la posición es anterior al período consultado, la hora no se infiere: la adopción registra `openTimeSource: UNVERIFIED` y usa la hora local de adopción. El stop nativo permanece. La etapa previa exacta (`trailing_stage`) y el riesgo original tampoco pueden deducirse con certeza de la posición actual; por ello la etapa local comienza en `INITIAL` y cualquier futura modificación del stop debe pasar por las reglas existentes que solo permiten mejorarlo. Esta limitación requiere un estado compartido cifrado si se quiere continuidad exacta de la etapa en todos los casos.
