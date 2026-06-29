# Telemetry Gap Analysis

Fecha: 2026-06-22 05:52 UTC

## Objetivo

Recuperar telemetria avanzada para:

- `trade_rejections`
- `scan_events`
- `post_trade_analysis`

Sin modificar logica de trading, scoring, ATR, trailing ni senales.

## Workflows activos analizados

| Workflow | Activo | Nodos relevantes | Tablas esperadas |
| --- | --- | --- | --- |
| `Advanced AI Trading Bot v2 - Clean` | si | `Build Trade Alert`, `Build Trade Alert of Image`, `Build AI Skip Message`, `Build AI Skip Message Image` | `trades`, `scan_events`, `trade_rejections` |
| `SL Monitor` | si | `SL Monitor Code`, `Post-Trade Agent` | `trade_closes`, `post_trade_analysis` |
| `Trailing Manager` | si | no escribe estas tablas directamente | ninguna de estas tres |

Tambien se usaron dos workflows temporales de prueba, ambos desactivados al final:

- `Telemetry Persistence Test`: inactivo.
- `Telemetry Persistence Webhook`: inactivo; su webhook devuelve 404 tras desactivarlo.

## Mapa esperado workflow -> endpoint -> tabla

| Evento | Workflow/nodo | Endpoint | Tabla | Condicion |
| --- | --- | --- | --- | --- |
| Senal aceptada | `Advanced AI Trading Bot v2 - Clean` / `Build Trade Alert*` | `/db/trade/open` | `trades` y ahora `scan_events` | Cuando la senal pasa filtros y se abre trade. |
| Senal rechazada | `Advanced AI Trading Bot v2 - Clean` / `Build AI Skip Message*` | `/db/rejection` | `trade_rejections` | Cuando la senal no pasa filtros/threshold/macro/vision. |
| Scan rechazado | `Advanced AI Trading Bot v2 - Clean` / `Build AI Skip Message*` | `/db/scan` | `scan_events` | Mismo evento rechazado, con `pass_ai=false`. |
| Trade cerrado | `SL Monitor` / `SL Monitor Code` | `/db/trade/close` | `trade_closes` | Cuando SL/TP cierra una posicion monitorizada. |
| Analisis post-trade | `SL Monitor` / `Post-Trade Agent` | `/db/post-trade` | `post_trade_analysis` | Despues de un cierre real con `telegramText`. |

## Gap detectado

Los endpoints `/db/rejection`, `/db/scan` y `/db/post-trade` existen y aceptan payloads compatibles.

La brecha real estaba en `scan_events` para senales aceptadas:

- El workflow aceptado escribia `/db/trade/open`.
- El scan aceptado no se registraba en `scan_events`.
- `scan_events.pass_ai` existia en schema, pero no habia persistencia para `pass_ai=true` en la ruta aceptada.

Adicionalmente, las escrituras de rechazo en el workflow estan dentro de `try/catch` silencioso; si fallan, n8n no muestra error. En esta validacion no fallaron.

## Correccion aplicada

Archivo modificado:

- `/home/aterum_gui/routes/analytics.js`

Cambio:

- Se creo helper `insertScanEvent(t, passAI, skipReason)`.
- `POST /db/scan` usa ese helper.
- `POST /db/trade/open` ahora llama `insertScanEvent(t, true, null)` despues de crear el trade.

Impacto:

- Una senal aceptada sigue usando el mismo contrato `/db/trade/open`.
- No cambia decision de entrada, indicadores, ATR, trailing, scoring ni ordenes.
- Solo agrega persistencia del scan aceptado en `scan_events`.

Runtime:

- Archivo copiado al contenedor `home-dashboard-1`.
- Reiniciado solo `dashboard`.
- Imagen persistida con `docker commit home-dashboard-1 aterum-dashboard:local`.
- `dashboard` volvio a `healthy`.

## Pruebas controladas

### Prueba directa de endpoints

Antes de probar desde n8n se verifico que los endpoints aceptaran payloads compatibles:

- `/db/rejection` -> `TELEMETRYREJUSDT`
- `/db/scan` -> `TELEMETRYSCANUSDT`
- `/db/post-trade` -> `TELEMETRYPOSTUSDT`

Resultado: los tres respondieron `{"ok":true}`.

### Prueba desde n8n

Se importo temporalmente `Telemetry Persistence Webhook`, se activo, se reinicio n8n para registrar el webhook y se disparo:

```text
POST http://127.0.0.1:5678/webhook/telemetry-persistence-test
```

Respuesta:

```json
{
  "ok": true,
  "source": "n8n-webhook",
  "accepted": { "ok": true, "id": 7 },
  "rejection": { "ok": true },
  "rejectedScan": { "ok": true },
  "postTrade": { "ok": true },
  "acceptedSymbol": "TLMACCUSDT",
  "rejectedSymbol": "TLMREJUSDT"
}
```

El workflow temporal fue desactivado despues de la prueba. Confirmacion posterior:

```text
POST /webhook/telemetry-persistence-test -> 404
Active version not found for workflow with id "telemetryPersistenceWebhook"
```

## Evidencia SQL

Conteos despues de las pruebas:

```text
trade_rejections       2
scan_events            3
post_trade_analysis    2
```

Registros generados desde n8n:

```text
trade_rejections
id  symbol      direction  final_score  scan_score  ai_regime        ai_bias  rejected_at
2   TLMREJUSDT  SHORT      44.000       0.333       HIGH_VOLATILITY  SHORT    2026-06-22 05:51:18
```

```text
scan_events
id  symbol      direction  pass_ai  final_score  scan_score  scanned_at
2   TLMACCUSDT  LONG       1        88.000       0.777       2026-06-22 05:51:18
3   TLMREJUSDT  SHORT      0        44.000       0.333       2026-06-22 05:51:18
```

```text
post_trade_analysis
id  symbol      direction  close_type  stage  pnl_usdt  r_final  duration_minutes  created_at
2   TLMACCUSDT  LONG       TP          LOCK   0.320000  2.0000   9                 2026-06-22 05:51:18
```

Trade aceptado/cerrado usado por la prueba n8n:

```text
trades
id  symbol      status  final_score  scan_score  opened_at
7   TLMACCUSDT  CLOSED  88.000       0.777       2026-06-22 05:51:18

trade_closes
id  trade_id  symbol      pnl_usdt  r_final  close_reason  trailing_stage  closed_at
4   7         TLMACCUSDT  0.320000  2.0000   TP            LOCK            2026-06-22 05:51:18
```

## Estado final

| Tabla | Estado |
| --- | --- |
| `trade_rejections` | Recibe rechazos desde n8n por `/db/rejection`. |
| `scan_events` | Recibe scans rechazados por `/db/scan` y scans aceptados por `/db/trade/open`. |
| `post_trade_analysis` | Recibe analisis post-trade desde n8n por `/db/post-trade`. |

No se ejecutaron ordenes reales de Binance.
