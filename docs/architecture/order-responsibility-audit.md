# Auditoría de responsabilidades de órdenes

Fecha: 2026-06-30 UTC

## Resultado

Binance es la única fuente de verdad y Position Guard contiene el único motor autorizado a mutar órdenes. n8n decide y solicita; no interpreta una aceptación HTTP como ejecución. El contrato completo está en [Pipeline de ejecución verificada](../trading/verified-execution-pipeline.md).

## Responsabilidades actuales

| Componente | Decide niveles/acción | Escribe Binance | Verifica read-back | Persiste trade | Notifica éxito |
| --- | :---: | :---: | :---: | :---: | :---: |
| Risk Guard / Position Sizer | Sí | No | No | No | No |
| Trailing Manager | Sí | No | No | No | No |
| SL Monitor | Decide trigger lógico | No | No | Cierre verificado | Después de VERIFIED |
| Execution Engine | No | Sí, único escritor | Sí | Execution ledger y estado confirmado | Fallos |
| Position Synchronization | No | Sólo emergencia vía Execution Engine | Sí | Binance → local | Deriva/fallos |

## Flujos auditados

- Apertura OPEN_POSITION crea MARKET, SL y TP; relee posición y ambas protecciones. Si falla protección, cierra y verifica rollback.
- Movimiento SL y trailing: crea la nueva protección, la verifica, cancela la anterior, vuelve a verificar y sólo entonces actualiza n8n/MySQL/Dashboard.
- Movimiento TP usa el mismo reemplazo protegido.
- TP parcial verifica reducción de cantidad Binance antes de persistir qty.
- Cierre SL/TIME_EXIT/manual verifica posición ausente y protección residual cancelada antes del cierre local.
- Cierre nativo externo exige posición ausente más fills reales; no asume que todo cierre externo fue TP.

## Invariantes operativos

- trade_executions conserva execution ID, exchange order ID, request/response, verificación, timestamps, intentos, error y estado final.
- Los reintentos usan client IDs deterministas; un timeout se consulta antes de volver a enviar.
- Un rechazo no cambia estado local y no emite Telegram de éxito.
- Position Guard compara entry, qty, leverage, SL y TP cada cinco segundos y corrige sólo Binance → local.
- Position Guard no calcula ATR, riesgo, score ni nuevos niveles.

## Chart API

### Causa raiz

`aterum_gui` y n8n usan `network_mode: service:dashboard` para conservar los contratos historicos `localhost`. Dashboard fue recreado y obtuvo un namespace nuevo. n8n se recreo, pero Chart API permanecio en el namespace anterior: el contenedor aparecia `up`, aunque `127.0.0.1:3000` rechazaba o cerraba conexiones.

Las ejecuciones `84321`, `84387` y `84443` confirman la misma causa con `curl shim: fetch failed` contra `http://localhost:3000/chart`; no fueron errores de simbolo, TradingView, nginx ni del shim curl.

### Correccion

- se recrearon Dashboard, Chart API y n8n sobre el mismo namespace actual;
- el healthcheck de Dashboard comprueba ahora `3001/healthz` y `3000/healthz`;
- Chart API tiene healthcheck propio;
- Position Guard incluye `Chart API` en el health global.

Cuando se fuerce la recreacion de Dashboard se deben recrear conjuntamente `aterum_gui` y `n8n`:

```bash
docker compose up -d --force-recreate dashboard aterum_gui n8n
```

### Evidencia

- `http://127.0.0.1:3000/healthz`: HTTP 200.
- `/chart?symbol=BTCUSDT` local: JPEG 1280x800, 79,529 bytes.
- `/chart?symbol=BTCUSDT` publico: JPEG 1280x800, 79,866 bytes.
- Advanced Bot ejecucion programada `84563`: `success` entre `05:15:13` y `05:15:50 UTC`, despues de tres fallos de chart consecutivos.
- Dashboard, Chart API, n8n y Position Guard: healthy.
