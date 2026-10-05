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
command -v aterum
git pull --ff-only origin main
npm ci
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
    'N8N_TRADING_DISABLED': '0',
}.items():
    line = f'{key}={value}'
    s = re.sub(rf'^{key}=.*$', line, s, flags=re.M) if re.search(rf'^{key}=', s, re.M) else s.rstrip() + '\n' + line + '\n'
p.write_text(s)
p.chmod(0o600)
PY
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
aterum start
aterum status
docker compose --profile trading --profile ai --profile aux ps
curl --fail http://127.0.0.1:3001/healthz
```

Comprobar en n8n que el workflow principal, SL Monitor y Trailing Manager estén publicados; comprobar que Position Guard, JEV y Telegram estén saludables. La política del repositorio fija ADX+Bollinger 4h LONG/SHORT con ADX ≥22, bandas ±1,8 y objetivo neto mínimo 1,5R, dos posiciones, leverage 5–10x y hasta 45% de margen por posición sujeto al presupuesto de pérdida. El resultado histórico sigue marcado `MANUAL_UNVALIDATED`.
