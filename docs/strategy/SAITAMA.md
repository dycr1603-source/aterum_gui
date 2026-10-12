# Preparar y arrancar Aterum en Saitama

La PC activa es Delcon; Saitama está apagada. La transferencia del código exige publicar el commit local de Delcon en `origin/main` antes de usar `git pull` en Saitama. No copies `.env` entre PCs: cada una conserva sus credenciales y clave n8n. El histórico de trades y los volúmenes tampoco se copian; la entrega cifrada de Telegram usa `aterum migrate`/`aterum start`.

## Delcon: publicar el código

Desde `~/projects/aterum/aterum_gui`:

```bash
git push origin main
git ls-remote origin refs/heads/main
```

El segundo comando debe mostrar el mismo commit que `git rev-parse HEAD`.

## Saitama: preparar sin arrancar trading

Encender Saitama y ejecutar desde su terminal:

```bash
cd ~/projects/aterum/aterum_gui
test -s .env
test -s .local/workflow-sync.json
git pull --ff-only origin main
npm ci
test -x "$HOME/.local/bin/aterum" || ./scripts/install-host-control.sh
npm run test:offline
npm run build
```

Configurar las banderas locales sin mostrar secretos:

```bash
python3 - <<'PY'
from pathlib import Path
import re
p = Path('.env')
s = p.read_text()
for key, value in {
    'STRATEGY_ENGINE': 'two-indicator',
    'JEV_ENABLED': 'true',
    'JEV_OBSERVE_ONLY': 'false',
    'JEV_PROVIDER': 'typesafe-jev',
    'JEV_DYNAMIC_LEVERAGE_ENABLED': 'true',
    'JEV_MAX_LEVERAGE': '10',
    'N8N_TRADING_DISABLED': '1',
    'PORTFOLIO_MAX_RISK_PCT': '44',
    'PORTFOLIO_MAX_MARGIN_USAGE_PCT': '90',
    'PORTFOLIO_MIN_FREE_MARGIN_PCT': '10',
    'PORTFOLIO_MAX_EXPOSURE_PCT': '900',
    'PORTFOLIO_MAX_SYMBOL_EXPOSURE_PCT': '450',
    'PORTFOLIO_MAX_DIRECTION_EXPOSURE_PCT': '900',
}.items():
    line = f'{key}={value}'
    s = re.sub(rf'^{key}=.*$', line, s, flags=re.M) if re.search(rf'^{key}=', s, re.M) else s.rstrip() + '\n' + line + '\n'
p.write_text(s)
p.chmod(0o600)
PY

node - <<'NODE'
require('./services/load_env');
const required = ['DB_PASSWORD', 'REDIS_PASSWORD', 'N8N_ENCRYPTION_KEY',
  'EXECUTION_ENGINE_TOKEN', 'BINANCE_API_KEY', 'BINANCE_API_SECRET',
  'TYPESAFE_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
const missing = required.filter(key => !String(process.env[key] || '').trim());
if (missing.length) {
  console.error('Faltan credenciales locales:', missing.join(', '));
  process.exitCode = 1;
} else console.log('Credenciales locales presentes; valores no mostrados.');
NODE
```

Hacer backup y sincronizar con n8n/Telegram detenidos:

```bash
node scripts/strategy/backup-deployment.js
npm run strategy:workflow
docker compose --profile trading --profile ai --profile aux build dashboard
docker compose --profile trading --profile ai --profile aux stop n8n telegram_control
N8N_TRADING_DISABLED=1 node scripts/sync-local-workflows.js --publish
```

El registro `.local/workflow-sync.json` de Saitama debe existir desde su sincronización anterior. El backup guarda la política del contenedor anterior incluso después de `git pull`. Si aparece `UNMANAGED_WORKFLOW` o `LOCAL_WORKFLOW_MODIFIED`, conserva la salida y no arranques aún: significa que el grafo local no coincide con su registro. No borres el registro ni sobrescribas el volumen para ocultar el conflicto.

La preparación deja `N8N_TRADING_DISABLED=1`. Conserva las credenciales y `N8N_ENCRYPTION_KEY` locales de Saitama; el archivo `.env` de Delcon no se copia. Verifica que el commit local coincida con `origin/main` y que el Compose sea válido antes del cambio de turno.

## Cambiar el turno

Cuando la preparación anterior pase, en **Delcon**:

```bash
cd ~/projects/aterum/aterum_gui
aterum migrate
aterum status
```

Continuar únicamente si `aterum status` muestra `RETIRED`, `migrationReady: true`, y todos sus contenedores detenidos.

En **Saitama**:

```bash
cd ~/projects/aterum/aterum_gui
python3 - <<'PY'
from pathlib import Path
import re
p = Path('.env')
s = p.read_text()
s, n = re.subn(r'^N8N_TRADING_DISABLED=.*$', 'N8N_TRADING_DISABLED=0', s, flags=re.M)
if n != 1:
    raise SystemExit('Revisar N8N_TRADING_DISABLED en .env antes del arranque')
p.write_text(s)
p.chmod(0o600)
PY
aterum start
aterum status
docker compose --profile trading --profile ai --profile aux ps
curl --fail http://127.0.0.1:3001/healthz
test "$(docker inspect aterum-dashboard-1 --format '{{.Image}}')" = "$(docker inspect aterum-position_guard-1 --format '{{.Image}}')"
```

Comprobar en n8n que el workflow principal, SL Monitor y Trailing Manager estén publicados; comprobar que Position Guard, JEV y Telegram estén saludables. Con posiciones existentes, comprueba por cada símbolo la cantidad y el lado en Binance, la adopción en la base local y las órdenes nativas STOP y TAKE PROFIT. `portfolio-capacity` puede responder `allowed:false` por margen lleno después de adoptar las posiciones protegidas; eso no equivale a un fallo de servicio.

La última comprobación de imagen es obligatoria: el análisis y Position Guard deben cargar exactamente la misma política. En Delcon, una versión anterior del guard rechazó una entrada con `STRATEGY_POLICY_CHANGED` después de añadir el cooldown. Si las imágenes difieren en Saitama, recrea solo `position_guard` con `docker compose --profile trading up -d --no-deps --force-recreate position_guard` y repite la comprobación de salud y protección antes de dejar correr el siguiente ciclo.

Si se recrea `dashboard` después de iniciar n8n, recrea también `aterum_gui` y `n8n`; estos servicios comparten la red de `dashboard`. Comprueba desde Position Guard que `http://dashboard:5678/healthz` responda 200. Un n8n que figure sano en `docker compose ps` puede seguir unido a la red anterior tras reemplazar dashboard.

Comprueba también `strategy_breaker.halted` y `reason` en MySQL antes de dar por concluido el traspaso. El error `STRATEGY_POLICY_CHANGED` activa el breaker: actualizar la imagen por sí solo no lo libera. Si persiste ese motivo tras corregir las imágenes, concilia primero todas las posiciones y protecciones con Binance; usa `scripts/strategy/reset-breaker.js` dentro de `dashboard` con una razón auditada solo cuando `portfolio-capacity` esté sano y no haya contabilidad pendiente. El script verifica estas condiciones y falla si no se cumplen.

La ruta `STRATEGY_ENGINE=two-indicator` habilita el motor de estrategia; la estrategia de entrada concreta se selecciona por `entryMode` en `config/strategy-v2.json`. En esta configuración la única estrategia elegida es `new_opportunistic` en velas de 1h, con JEV y ejecución en modo `enforce`; los nodos n8n llamados `Two Indicator Decision` son nombres históricos de la ruta, no una segunda estrategia que opere en paralelo. La activación está ligada a una autorización manual y continúa `MANUAL_UNVALIDATED`: el informe histórico está rechazado y no hay evidencia de 70% de operaciones ganadoras sostenido fuera de muestra. Los límites de cartera configurados son hasta 22% de riesgo al stop por operación y 44% agregado, tres posiciones como máximo, margen de 35% por posición y 90% total, con leverage entre 5x y 10x. Los filtros manuales están ahora alineados con la política activa: profundidad mínima de 500 y multiplicador dinámico 3; esta alineación permite evaluar la política activa, pero no valida su rentabilidad ni elimina los controles de riesgo.
