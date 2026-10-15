# Aterum V2 en una Mini PC — manual de implementación para Codex

Estado de esta entrega (15 de octubre de 2026): **solo documentación**. Este repositorio todavía es Aterum V1, con MariaDB, SQLite de n8n y varias rutas a Binance Producción. **No ejecutar `docker compose up` del Compose actual en la Mini PC con claves de Producción.** Este documento instruye a la nueva sesión de Codex para construir V2 desde cero en la Mini PC. Ninguna orden real está autorizada. La única modalidad permitida es Binance USDⓈ-M Futures Testnet, después de superar los controles descritos abajo.

Las secciones 1–11 del «diseño original de Aterum V2» mencionadas en el adjunto no fueron entregadas como archivo ni están versionadas en este repo. Esta especificación reconstruye los contratos necesarios a partir del código y de los requisitos recibidos. Si el usuario aporta aquel diseño, Codex debe contrastarlo y resolver discrepancias antes de activar la automatización; no debe afirmar que verificó un documento que no recibió.

## 1. Mandato y alcance

Al recibir «implementa `README_NEW_PC.md`», Codex debe inspeccionar el hardware, crear los componentes V2 que faltan, instalar dependencias, migrar la configuración local de forma segura, probar, levantar y entregar evidencias. No pedir aprobación por comandos locales reversibles. Si falta una clave externa, continuar con lo independiente y reportar el componente pendiente. No destruir datos existentes, transferir fondos, usar claves de Producción ni activar órdenes reales. No declarar V2 completa por el mero hecho de que `docker compose ps` indique `healthy`.

El objetivo es un sistema con controlador de estrategias Python/FastAPI, Laya local, 50 instancias lógicas independientes de mercado o estrategia, backtester reproducible, Risk Manager independiente, gateway exclusivo de órdenes Testnet, PostgreSQL, Redis, n8n y GUI. La selección y el despliegue automático de estrategias ocurren **solo en Testnet** tras validación objetiva, versionado y posibilidad de reversión. Ninguna prueba histórica garantiza beneficios.

### Qué reutilizar y qué implementar

| Componente | Estado en este repositorio | Acción V2 |
| --- | --- | --- |
| GUI Express (`trade.js`, `server.js`, `routes/`, `views/`) | Existe; usa MariaDB y llamadas Binance Producción | Adaptar a API/PG V2; ocultar o bloquear rutas heredadas no migradas. |
| Laya (`laya-local/Dockerfile`) | Existe; Python 3.11, `laya[serve]==0.4.6`, CPU, puerto 8000 | Reutilizar con token interno y caché; probar contrato de respuesta con controlador. |
| Position Guard (`position-guard/`) | Existe; cliente firmado con base Producción fija | Extraer/adaptar conciliación y protección al gateway Testnet; no desplegarlo sin guardas nuevas. |
| Estrategia (`services/strategy/`, `config/strategy-v2.json`) | Una ruta activa oportunista; no hay 50 instancias | Conservar como referencia y crear plugins/versiones V2; no llamarla rentable sin nueva evidencia. |
| n8n (`bot-control/workflows/current/`) | Cuatro workflows gestionados; SQLite local | Adaptar nodos y conexiones a servicios V2; importar en n8n/PostgreSQL. |
| Sincronizador (`scripts/sync-local-workflows.js`) | Lee/escribe SQLite de n8n | No reutilizar en PG; implementar publicación V2 por CLI/API con hashes y verificación. |
| Strategy Controller, backtester V2, Risk Manager separado, gateway Testnet, migraciones PG | **No existen** | Implementar y probar antes de iniciar el ciclo autónomo. |

## 2. Puerta de seguridad Testnet, obligatoria desde el primer commit V2

Usar `TRADING_ENV=testnet` y `BINANCE_FUTURES_TESTNET=true` como configuración redundante; ambos deben coincidir. La URL REST aprobada para USDⓈ-M Futures Testnet es `https://testnet.binancefuture.com`, según el [conector oficial de Binance Futures para Node](https://github.com/binance/binance-futures-connector-node#testnet). Confirmar en la documentación oficial de Binance en la Mini PC antes de fijar la imagen; si cambia, actualizar una allowlist revisada, **nunca** caer automáticamente en `https://fapi.binance.com`. La [documentación de Binance](https://developers.binance.com/en/docs/introduction) advierte que el soporte de testnet varía por producto; limitar V2 a USDⓈ-M Futures y deshabilitar Portfolio Margin, Spot, COIN-M y Convert salvo prueba específica de compatibilidad no productiva.

Implementar **tres bloqueos independientes**:

1. **Configuración y secretos:** solo `BINANCE_TESTNET_API_KEY` y `BINANCE_TESTNET_API_SECRET` llegan al gateway. Las variables heredadas `BINANCE_API_KEY`, `BINANCE_API_SECRET` y `POSITION_GUARD_BINANCE_*` quedan vacías en los contenedores V2. Rechazar arranque con `TRADING_ENV` ausente/distinto, URL fuera de la allowlist o credenciales Testnet ausentes cuando se habilitan órdenes. No intentar clasificar una clave de Producción por su formato: Binance no garantiza un prefijo distinguible; exigir procedencia de la consola Testnet y validar la firma contra la cuenta Testnet.
2. **Gateway de ejecución:** único proceso con claves y capacidad de firmar. Construye internamente la URL a partir de una constante validada; ignora URLs propuestas por Laya, n8n, GUI o estrategias. Rechaza redirecciones, esquemas distintos de HTTPS, hosts con sufijos engañosos, puertos inesperados y cualquier intento de cambiar la base por variable externa. Todos los métodos mutantes (`POST`, `PUT`, `DELETE`) y lecturas privadas pasan por este gateway; el gateway vuelve a comprobar autorización de riesgo, versión activa, símbolo, filtros, margen y llave idempotente justo antes de firmar. Un error o timeout deja el estado como no confirmado hasta read-back Testnet, nunca como éxito supuesto.
3. **Aislamiento de red:** controlador, workers, n8n y GUI sin claves Binance y sin salida directa de órdenes; el gateway es el único servicio conectado a una red de egreso limitada a Testnet. Configurar firewall/proxy de egreso o política equivalente del host para denegar dominios/IP de Producción; Docker `internal: true` por sí solo no basta para restringir el contenedor con egreso. Probar desde cada contenedor que una orden o firma a Producción es imposible incluso si el código solicita ese host.

La prueba de aceptación debe demostrar: host Testnet en cada petición firmada, claves Testnet solamente en el gateway, 0 secretos de Producción en entornos/volúmenes de contenedores, 0 conexiones mutantes a Producción y fallo cerrado ante URL inyectada, DNS adverso, redirect, host alterno, credencial ausente y arranque sin `TRADING_ENV=testnet`. Registrar host, método, ruta y correlation ID sin firma, query firmada ni claves. No basarse únicamente en `rg`: instrumentar transporte y red en tests de integración.

## 3. Inventario obligatorio de Binance V1 antes de portar código

Ejecutar desde la copia **sin credenciales** del repositorio:

```bash
rg -n 'fapi\.binance\.com|api\.binance\.com|binancefuture\.com|BINANCE_API_KEY|BINANCE_API_SECRET|/fapi/' \
  position-guard services routes telegram-control bot-control/workflows scripts \
  --glob '!**/archive/**' --glob '!**/*.test.js' > /tmp/aterum-v2-binance-inventory.txt
```

Revisar además los JSON de `bot-control/workflows/current/`, las variables de `docker-compose.yml`, `.env.example`, `docker.env.example` y los Dockerfiles. El inventario conocido en esta revisión incluye:

| Ruta | Uso actual | Riesgo al portar |
| --- | --- | --- |
| `position-guard/binance.js`, `position-guard/config.js` | Cliente HMAC: órdenes, algo SL/TP, leverage, saldo, posiciones, órdenes y fills; base `https://fapi.binance.com` | Principal ruta de órdenes reales. |
| `routes/account.js`, `shared.js` | Cuenta, posiciones, listenKey, precios y websocket del dashboard | Exponer datos/credenciales de Producción al GUI. |
| `services/strategy/engine.js`, `services/jev.js`, `services/opportunity_engine.js`, `services/simulator.js` | Mercado, filtros y comprobaciones preentrada | Mezclar precios/mercados de Producción con cuenta Testnet. |
| `telegram-control/health.js` | Ping a Producción | Indicador de salud engañoso en V2. |
| `bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json` | Nodos `Daily PnL Report`, `Risk Guard`, `Daily Analysis Report`, `Weekly Deep Analysis`, `AGENTE DE MERCADO` | Código incrustado, incluidos requests firmados. |
| `bot-control/workflows/current/sl-monitor.workflow.json` | `SL Monitor Code` | Monitoreo firmado y posibles cierres. |
| `bot-control/workflows/current/trailing-manager.workflow.json` | `Trailing Manager Code` | Precios y modificaciones de SL/TP. |
| `bot-control/workflows/code/risk-guard-v2.js`, `market-context-v2.js`, `research-ai-capacity-preflight.js` | Datos/firmas desde nodos | Pasar por gateway/servicio de mercado V2. |
| `scripts/strategy/*`, auditorías y descargas históricas | Lecturas de Producción para investigación | Mantener como herramientas offline aisladas, nunca en el perfil V2. |

Inspeccionar también dependencias transitivas y SDKs. El cliente principal es código propio con `fetch`/HMAC; no asumir que cambiar una variable reescribe sus bases fijas. En un SDK nuevo exigir base URL Testnet explícita y test que rechace su default de Producción. Probar `exchangeInfo`, `positionRisk`, leverage brackets, comisión, modo Hedge/One-way, filtros de tick/lot/minNotional, `MARKET`, `STOP_MARKET`/algo, `TAKE_PROFIT_MARKET`/algo, cancelación y read-back **en Testnet**. Si Testnet no ofrece un contrato usado por V1, adaptar el flujo o bloquear esa operación; no enviar una solicitud a Producción como alternativa. Crear el universo de símbolos desde `exchangeInfo` Testnet y descartar los no negociables; no asumir que los 50 símbolos V1 existen allí.

## 4. Preparación física y dependencias de la Mini PC

Primero inspeccionar y guardar un reporte sin secretos en `artifacts/new-pc/hardware.json`:

```bash
uname -a
cat /etc/os-release
uname -m
lscpu
free -h
df -h
lsblk -f
command -v nvidia-smi >/dev/null && nvidia-smi || true
command -v docker >/dev/null && docker --version || true
command -v docker >/dev/null && docker compose version || true
```

Confirmar arquitectura `amd64`/`arm64`, CPU, RAM, disco libre, aceleración disponible y soporte real de las imágenes. Los 50 mercados son **instancias lógicas** con concurrencia acotada; no lanzar 50 modelos Laya ni 50 procesos si la máquina no lo soporta. Medir tiempo y memoria de Laya/backtests antes de fijar concurrencia. Si el equipo no alcanza la carga, dejar instancias definidas pero limitar las activas y reportarlo; no declarar aceptación de 50 activas.

En Ubuntu compatible, instalar Docker Engine y Compose desde el [repositorio oficial de Docker](https://docs.docker.com/engine/install/ubuntu/), no desde un script remoto sin revisión. Para Debian u otra distribución, seguir la variante oficial correspondiente. Comandos Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git jq openssl rsync python3 python3-venv
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
  "$(dpkg --print-architecture)" "${UBUNTU_CODENAME:-$VERSION_CODENAME}" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Usar `sudo docker` hasta configurar acceso local explícito; pertenecer al grupo `docker` equivale prácticamente a privilegios de root. Instalar Node 22 solo si se ejecutan `npm ci`/tests fuera de contenedores; la imagen actual usa `node:22-bookworm-slim`. No instalar PostgreSQL, Redis, n8n o Python de aplicación en el host si se usarán imágenes Compose.

Clonar únicamente desde el remoto autorizado de este repo y fijar un commit revisado:

```bash
mkdir -p "$HOME/projects/aterum"
git clone https://github.com/dycr1603-source/aterum_gui.git "$HOME/projects/aterum/aterum_gui"
cd "$HOME/projects/aterum/aterum_gui"
git status --short
git rev-parse HEAD
```

Antes de ejecutar código descargado, comprobar remoto, rama y commit. No usar `git pull` sobre cambios locales sin inspección. Crear `/srv/aterum-v2/{backups,artifacts,logs}` con propietario de servicio y modo restrictivo; usar volúmenes Docker nombrados para `postgres`, `redis`, `n8n`, `laya_model_cache` y artefactos, evitando que una reinstalación borre datos.

## 5. Versiones, directorios y archivos que Codex debe crear

Fijar versiones exactas/digest en los archivos finales; **no usar `latest`**. Línea base a validar en la Mini PC: PostgreSQL 16, Redis 7, Node 22, Python 3.11 y Laya 0.4.6 ya usada en `laya-local/Dockerfile`. Elegir y fijar una versión de n8n compatible con PostgreSQL/queue mode en el momento de implementación; registrar imagen/digest y migración en `artifacts/new-pc/versions.json`. Fijar `fastapi`, `uvicorn`, `pydantic`, `sqlalchemy`, `alembic`, `psycopg` y herramientas de test en lockfile; no resolver versiones dinámicamente al reiniciar. Las [guías de FastAPI](https://fastapi.tiangolo.com/deployment/docker/) cubren imágenes Python reproducibles; la [guía n8n de queue mode](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode/) exige Redis y recomienda PostgreSQL frente a SQLite.

Estructura objetivo dentro del repo (crear solo durante la implementación en la Mini PC):

```text
README_NEW_PC.md
docker-compose.v2.yml
.env.v2.example                 # sin secretos
v2/
  controller/                    # FastAPI, estrategia/versiones, API, scheduler
  risk-manager/                  # política independiente y exposición agregada
  execution-gateway/            # único firmante, allowlist Testnet y conciliación
  market-data/                   # universo, velas, spreads, filtros Testnet
  backtester/                    # replay, costos, walk-forward y escenarios
  strategy-plugins/              # interfaz común y versiones inmutables
  db/migrations/                 # Alembic, esquema propio PostgreSQL
  n8n/                           # manifiestos, importador idempotente, pruebas
  tests/                         # unitarias, integración, egress y reinicio
  scripts/                       # preflight, backup, restore-test, aceptación
artifacts/new-pc/               # reportes sin secretos; no subir datos sensibles
```

`docker-compose.v2.yml` debe definir exactamente: `postgres`, `redis`, `laya`, `market-data`, `backtester`, `risk-manager`, `execution-gateway`, `strategy-controller`, `n8n` principal, al menos un `n8n-worker` si se usa queue mode, `dashboard` y proxy. Redes `internal` para bases/colas; solo proxy accesible desde LAN, y solo gateway con egreso Testnet. No publicar PostgreSQL, Redis, Laya ni gateway a `0.0.0.0`. Usar usuarios no root, volúmenes nombrados, `restart: unless-stopped`, límites de CPU/memoria acordes al hardware, healthchecks de proceso **y dependencias**, y `depends_on: condition: service_healthy` donde aplique. Fijar `DB_TYPE=postgresdb`, host/db/user/password de n8n, `EXECUTIONS_MODE=queue`, `QUEUE_BULL_REDIS_*` y la misma `N8N_ENCRYPTION_KEY` en principal/worker; si no hay worker, n8n no puede ejecutar trabajos en queue mode. Crear BD `aterum_v2` y `n8n` separadas en PostgreSQL, con usuarios y permisos separados; Redis con ACL/contraseña y prefijos o DB lógicas separadas. La [documentación oficial de n8n](https://docs.n8n.io/deploy/host-n8n/configure-n8n/choose-n8ns-database.md) debe verificarse para la versión fijada.

Puertos internos propuestos, a fijar en Compose: PostgreSQL `5432`, Redis `6379`, Laya `8000` (`/health`), controller `8080` (`/healthz`), backtester `8081`, Risk Manager `8082`, gateway `8083`, market-data `8084`, n8n `5678` (`/healthz`), GUI `3001`; solo el proxy publica `80/443` o un puerto LAN aprobado. Cada `/healthz` debe comprobar sus dependencias críticas y exponer `ready=false` si el motor Testnet/DB/cola no está listo. Añadir una unidad `v2/ops/aterum-v2.service` que use la ruta absoluta del checkout y `docker compose --env-file .env -f docker-compose.v2.yml up -d`; instalarla solamente tras la aceptación, sin depender de los servicios systemd de Aterum V1.

No montar la `.env` heredada en ningún contenedor V2. El Compose V1 (`docker-compose.yml`) y el sincronizador SQLite quedan excluidos del comando de despliegue V2. Si se reutiliza GUI V1, adaptar primero sus rutas y queries MariaDB/Producción; deshabilitar explícitamente rutas sin portar. El dashboard V2 debe mostrar `TRADING_ENV`, salud, 50 instancias, versiones, decisiones, testnet fills, riesgos, bloqueos, pruebas y rollback, siempre con etiqueta visible «TESTNET».

## 6. Migración de `.env` sin filtrar credenciales

El usuario copiará manualmente la `.env` antigua a la Mini PC. Tratarla como **referencia con secretos de Producción**, no como configuración ejecutable. Antes de `docker compose`:

```bash
cd "$HOME/projects/aterum/aterum_gui"
umask 077
install -d -m 0700 "$HOME/.local/share/aterum-v2"
test -s .env
mv .env "$HOME/.local/share/aterum-v2/legacy.env"
chmod 0600 "$HOME/.local/share/aterum-v2/legacy.env"
touch .env
chmod 0600 .env
git check-ignore .env
```

Codex debe crear `v2/scripts/migrate-env.py` que lea `legacy.env` local, produzca un **inventario de nombres y estados presente/ausente, jamás valores**, identifique referencias en el código/Compose, conserve valores no sensibles y secretos reutilizables solo cuando la dependencia sea conocida y compatible, genere secretos internos nuevos cuando corresponda (`openssl rand -hex 32` o `secrets.token_hex(32)`), y escriba `.env` activo de modo atómico `0600`. Nunca copiar `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `POSITION_GUARD_BINANCE_*` ni cualquier clave firmante de Producción a `.env` V2. No sobrescribir valores válidos en ejecuciones repetidas. Variables desconocidas se preservan **solo en la referencia**, se marcan para revisión y no se inyectan a contenedores. No inventar claves externas; dejarlas vacías y registrar el nombre pendiente. Si se importan credenciales cifradas de n8n, conservar `N8N_ENCRYPTION_KEY` correspondiente; en una instancia nueva puede generarse una clave nueva.

Esquema mínimo de `.env.v2.example` a crear (vacío significa pendiente; ningún valor real se versiona):

```dotenv
TRADING_ENV=testnet
BINANCE_FUTURES_TESTNET=true
BINANCE_TESTNET_REST_BASE=https://testnet.binancefuture.com
BINANCE_TESTNET_API_KEY=
BINANCE_TESTNET_API_SECRET=
TESTNET_ORDER_ENABLED=false
LAYA_ENABLED=true
LAYA_API_URL=http://laya:8000/v1/systemone
LAYA_MODEL=english
LAYA_API_KEY=
ATERUM_AUTONOMOUS_MODE=false
ATERUM_AUTO_OPTIMIZATION=false
ATERUM_AUTO_DEPLOY_TESTNET=false
STRATEGY_CONTROLLER_URL=http://strategy-controller:8080
BACKTEST_ENGINE_URL=http://backtester:8081
RISK_MANAGER_URL=http://risk-manager:8082
EXECUTION_GATEWAY_URL=http://execution-gateway:8083
POSTGRES_HOST=postgres
POSTGRES_DB=aterum_v2
POSTGRES_USER=aterum_v2
POSTGRES_PASSWORD=
N8N_POSTGRES_DB=n8n
N8N_POSTGRES_USER=n8n
N8N_POSTGRES_PASSWORD=
N8N_ENCRYPTION_KEY=
REDIS_HOST=redis
REDIS_PASSWORD=
INTERNAL_SERVICE_TOKEN=
```

Revisar dependencias de `TELEGRAM_*`, `RESEARCH_ANTHROPIC_API_KEY`, `SESSION_SECRET`, `JWT_SECRET`, `APP_DOMAIN`, `DB_*`, `N8N_*`, `JEV_*` y variables de cartera; migrarlas solo al servicio que realmente las usa. `DB_*` MariaDB y claves Binance V1 deben estar ausentes de los servicios V2. Laya no requiere entrenar una base semántica para responder; si se añade memoria/embeddings, usar PostgreSQL/pgvector como módulo opcional, sin hacerla condición del control de riesgo. Validar carga de configuración de **cada servicio** con tests que solo muestren nombres/booleanos de presencia, nunca secretos.

## 7. Contratos funcionales que hay que implementar

1. **Strategy Controller:** FastAPI con `GET /healthz`, `GET /v1/strategies`, `POST /v1/strategies/candidates`, `POST /v1/strategies/{id}/backtest`, `POST /v1/strategies/{id}/activate`, `POST /v1/strategies/{id}/rollback`, `GET /v1/markets/{symbol}/state`. Escrituras autenticadas, auditoría y versionado inmutable. Estados `DRAFT → BACKTESTED → VALIDATED → SHADOW → TESTNET_ACTIVE → RETIRED`. Transiciones atómicas; una activación automática exige certificado de validación, versión de datos, política de riesgo vigente y rollback conocido. Nunca hay estado `PRODUCTION_ACTIVE` en V2.
2. **50 instancias independientes:** tabla `strategy_instances` con `instance_id`, símbolo Testnet, estrategia/versión, estado, watermark de datos, posición, límite y último resultado. Cola con llave única `(instance_id, candle_close_time, strategy_version)` para evitar duplicados; aislamiento de errores por instancia, presupuesto de rate limits compartido y máximo de órdenes concurrentes a nivel cartera. Elegir 50 símbolos negociables tras comprobar `exchangeInfo` Testnet; si hay menos, activar solo los disponibles y reportar el déficit. No tratar «50» como permiso para abrir 50 posiciones.
3. **Backtester:** ingestión versionada de velas, spreads, profundidad y tarifas; separar train/validation/test por tiempo, walk-forward, costos de comisión/slippage/funding, latencia, liquidación y sensibilidad de parámetros. Prohibir leakage de barras futuras y reutilización de test para optimización. Reportar Net PnL, expectativa, PF, drawdown, Sharpe/Sortino, número de trades, intervalos bootstrap y resultados por régimen. Si no hay expectativa positiva demostrable, etiquetar «experimental», sin autoactivación de órdenes.
4. **Laya:** contrato JSON versionado `symbol, side LONG|SHORT|NO_TRADE, confidence_raw, rationale, evidence, proposed_tp/sl, timestamp, model_version`; validar esquema, frescura y precios. Laya propone; no firma órdenes, no cambia límites, no crea versiones activas por sí sola. Timeout o respuesta inválida = no nueva entrada; posiciones existentes siguen protegidas por gateway/monitor.
5. **Risk Manager separado:** verifica pérdidas máximas, margen propio frente a exposición apalancada, SL nativo, concentración, correlación, cantidad/step/tick, liquidez, datos actuales, máximo de posiciones y riesgo de liquidación. Persiste reserva de riesgo con TTL y `decision_id`; el gateway revalida reserva y estado Testnet antes de cualquier orden. Ante desconexión del Risk Manager, nuevas órdenes bloqueadas, pero reconciliación/cierres protectores continúan según política explícita.
6. **Gateway Testnet:** API interna `POST /v1/orders/open`, `POST /v1/orders/close`, `POST /v1/orders/protection`, `GET /v1/positions`, `GET /v1/orders/{client_id}`, `GET /healthz`. Requiere `Idempotency-Key`, `decision_id`, `strategy_version`, `TRADING_ENV=testnet`; persiste intención antes de enviar, consulta read-back tras timeout, registra fill/fees/funding y confirma SL/TP nativos antes de anunciar apertura. No duplicar órdenes por reintentos. Las tres posiciones —si esa política se conserva— se administran y concilian por separado.
7. **n8n:** coordinador de horarios, notificaciones y procesos secundarios, **sin claves Binance y sin llamadas directas a `/fapi/*`**. Adaptar y versionar los cuatro workflows gestionados; cada uno usa APIs internas con token y correlation ID. Importar a n8n con PostgreSQL mediante CLI/API de la versión fijada; comparar hash guardado/publicado y certificar que los nodos/credenciales son Testnet. No usar `scripts/sync-local-workflows.js` contra PostgreSQL.
8. **PostgreSQL:** Alembic crea `strategy_versions`, `strategy_instances`, `market_bars`, `dataset_versions`, `backtest_runs`, `decisions`, `risk_reservations`, `order_intents`, `exchange_orders`, `fills`, `positions`, `position_events`, `notifications`, `audit_events`. Claves únicas de idempotencia, `environment='testnet'` no nulo en eventos de trading, timestamps UTC, FK y transacciones. Históricos de Producción, si se importan para investigación, van a esquema separado `research_legacy` de solo lectura; nunca se unen a ledger Testnet como si fueran operaciones Testnet.

## 8. Orden de construcción y comandos de despliegue

Codex debe implementar los archivos de la sección 5 y sus tests **antes** de ejecutar estos comandos. Ejecutar cada fase de forma idempotente: detectar estado previo, no borrar volúmenes ni reimportar duplicados.

```bash
cd "$HOME/projects/aterum/aterum_gui"
python3 v2/scripts/migrate-env.py --source "$HOME/.local/share/aterum-v2/legacy.env" --target .env --report artifacts/new-pc/env-inventory.json
python3 v2/scripts/preflight.py --env .env --no-secrets
docker compose --env-file .env -f docker-compose.v2.yml config --quiet
docker compose --env-file .env -f docker-compose.v2.yml build
docker compose --env-file .env -f docker-compose.v2.yml up -d postgres redis
docker compose --env-file .env -f docker-compose.v2.yml run --rm strategy-controller alembic upgrade head
docker compose --env-file .env -f docker-compose.v2.yml up -d laya market-data backtester risk-manager execution-gateway strategy-controller dashboard n8n n8n-worker
docker compose --env-file .env -f docker-compose.v2.yml ps
python3 v2/scripts/publish-workflows.py --verify --publish --testnet-only
python3 v2/scripts/acceptance.py --phase shadow --report artifacts/new-pc/acceptance-shadow.json
```

En la fase anterior `TESTNET_ORDER_ENABLED=false`, `ATERUM_AUTONOMOUS_MODE=false` y `ATERUM_AUTO_DEPLOY_TESTNET=false`. Ejecutar pruebas unitarias, de contratos, backtest, API, DB, colas, seguridad de egreso, reinicio y reconciliación antes de la primera orden simulada. Crear comandos de test reproducibles en `v2/scripts/test-all.sh` (con exit no cero ante fallo). Solo después de validación Testnet y credenciales reales de **Testnet**, habilitar orden Testnet con configuración auditada, recrear el gateway/controlador y ejecutar una orden de tamaño mínimo permitida por Testnet, verificando fill, SL, TP, cierre y ledger. Esa orden no toca fondos reales, pero debe seguir los límites de riesgo y quedar en el reporte. La activación autónoma Testnet se habilita después de pasar esta prueba, con rollback automático y supervisión.

### Pruebas mínimas de bloqueo y compatibilidad

```bash
v2/scripts/test-all.sh
python3 v2/scripts/audit-binance-egress.py --compose docker-compose.v2.yml --fail-on-production
python3 v2/scripts/acceptance.py --phase testnet --report artifacts/new-pc/acceptance-testnet.json
docker compose --env-file .env -f docker-compose.v2.yml ps
```

El auditor debe inspeccionar código ejecutable, JSON n8n, variables efectivas **sin imprimir valores**, imágenes, tráfico capturado y políticas de red. Incluir tests negativos de `fapi.binance.com`, subdominio engañoso, redirect 30x, base URL de SDK por defecto, variable `TRADING_ENV=production`, clave vieja inyectada, respuesta Laya con URL maliciosa y workflow que intenta `POST /fapi/v1/order`. Verificar que el resultado de todos sea `BLOCKED` y 0 solicitudes mutantes a Producción. Test de integración real firmado solo contra Testnet; los mocks no sustituyen la verificación de red.

## 9. Persistencia, backup, reinicio y recuperación

Programar backup diario cifrado de PostgreSQL, export de workflows/credenciales n8n con su clave custodiada, y manifiesto de versiones/artefactos. `pg_dump`/restore se prueban en BD **desechable**, nunca sobre la BD activa. Un ejemplo no destructivo, una vez creado el Compose V2:

```bash
backup_dir="/srv/aterum-v2/backups/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup_dir"
docker compose --env-file .env -f docker-compose.v2.yml exec -T postgres \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup_dir/aterum_v2.dump"
chmod 0600 "$backup_dir/aterum_v2.dump"
test -s "$backup_dir/aterum_v2.dump"
```

Añadir retención, verificación de checksum y copia fuera de la Mini PC; documentar claves y ubicación sin publicarlas. Probar una restauración en contenedor/base temporal y comparar conteos/hashes. Antes de upgrade: pausar nuevas entradas Testnet, drenar workers, tomar backup, migrar DB, publicar workflows, comprobar salud/read-back y reanudar. Rollback: detener activación automática, seleccionar versión anterior firmada, revertir imagen/manifiesto y **migrar BD solo con procedimiento compatible**; no usar `alembic downgrade` ciegamente sobre datos nuevos. El gateway concilia órdenes/posiciones Testnet antes de aceptar reintentos.

Para reinicio parcial: ejecutar `docker compose ... ps`, revisar `artifacts/new-pc/versions.json`, `alembic current`, versiones n8n y tabla de intenciones pendientes; repetir solo fases idempotentes. No recrear `.env` ni credenciales. Instalar una unidad systemd que ejecute `docker compose --env-file .env -f docker-compose.v2.yml up -d` al arranque **solo después** de superar aceptación; primero arrancan bases y Laya, luego servicios y n8n. El gateway conserva `TESTNET_ORDER_ENABLED=false` hasta que salud, reconciliación, Risk Manager y Testnet estén verificados. Simular corte/reinicio y demostrar recuperación sin duplicar orden ni perder versión activa.

Comandos de diagnóstico/reanudación, sin borrar datos:

```bash
cd "$HOME/projects/aterum/aterum_gui"
docker compose --env-file .env -f docker-compose.v2.yml ps
docker compose --env-file .env -f docker-compose.v2.yml logs --tail=200 postgres redis laya strategy-controller risk-manager execution-gateway n8n n8n-worker
python3 v2/scripts/preflight.py --env .env --no-secrets
docker compose --env-file .env -f docker-compose.v2.yml run --rm strategy-controller alembic current
python3 v2/scripts/acceptance.py --phase shadow --report artifacts/new-pc/acceptance-resume.json
```

No ejecutar `docker compose down -v`, `docker volume rm` ni restauraciones encima de datos activos. Un fallo de credenciales externas mantiene el stack de observación disponible, pero las órdenes Testnet desactivadas.

## 10. Criterio de finalización y reporte obligatorio

Completo significa evidencia fechada de: servicios sanos tras reinicio; Laya ↔ controlador; creación y rollback de versiones; backtester que evalúa cambios y costos; 50 instancias lógicas verificadas o déficit explícito de símbolos/recursos; activación automática **en Testnet** con política aprobada; cuatro workflows independientes y publicados; PostgreSQL con decisiones, cambios, órdenes/fills; Risk Manager que bloquea independiente de Laya; gateway que impide toda ruta real; GUI mostrando estado Testnet; backup/restauración; límites de riesgo y reconciliación. Si falta una clave Testnet o cualquier prueba, marcar `PARTIAL/BLOCKED` con siguiente acción y mantener órdenes desactivadas.

Checklist de aceptación que Codex debe completar en el reporte, con evidencia enlazada por ítem:

- [ ] Hardware/OS, recursos y versiones/digests registrados.
- [ ] `.env` activo sin claves de Producción; claves Testnet obtenidas de fuente Testnet.
- [ ] `TRADING_ENV=testnet`, red y gateway rechazan todo destino de Producción.
- [ ] Migraciones PostgreSQL, backup y restauración de prueba terminados.
- [ ] Laya y los diez servicios V2 requeridos están listos tras reinicio.
- [ ] 50 instancias independientes o déficit cuantificado, sin duplicados de ciclo.
- [ ] Backtester con costos, fuera de muestra y rollback de versión.
- [ ] Risk Manager veta una propuesta insegura aunque Laya la apruebe.
- [ ] n8n procesa los cuatro workflows V2 sin credenciales Binance directas.
- [ ] Orden de prueba Testnet y protecciones confirmadas por read-back, sin fondos reales.
- [ ] GUI muestra entorno y estado verificables; autonomía Testnet auditada.
- [ ] Pruebas negativas de egreso, redirección y secretos pasan; 0 órdenes reales.

El reporte `artifacts/new-pc/INSTALL_REPORT.md` debe contener commit, OS/hardware, versiones/digests, mapa de variables sin valores, resultados de pruebas con comandos y exit codes, endpoints Testnet utilizados, número de instancias, posición/orden de prueba Testnet, estado de backups, incidentes, pendientes externos y evidencia explícita de **0 órdenes reales**. No publicar logs con firmas, claves, `.env`, datos privados ni dumps. No confundir simulación o PnL Testnet con rentabilidad real.

### Referencias primarias para revisar antes de implementar

- [Binance Developer Docs: entornos y seguridad](https://developers.binance.com/en/docs/introduction).
- [Binance Futures Node Connector: Testnet y URL explícita](https://github.com/binance/binance-futures-connector-node#testnet).
- [Docker Engine en Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
- [n8n: queue mode, Redis, PostgreSQL y clave compartida](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode/).
- [n8n: bases de datos soportadas](https://docs.n8n.io/deploy/host-n8n/configure-n8n/choose-n8ns-database.md).
- [FastAPI en contenedores](https://fastapi.tiangolo.com/deployment/docker/).
