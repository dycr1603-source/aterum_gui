# Incidente Stop Loss HYPEUSDT

Fecha de auditoria: 2026-06-29 UTC

## Resultado ejecutivo

La posición `HYPEUSDT SHORT` no tuvo una orden Stop Loss nativa en Binance. El sistema dependía de un stop lógico ejecutado por `SL Monitor` cada diez segundos. Una carrera de escritura en `workflow staticData` eliminó HYPE del estado monitorizado segundos después de abrirse. Binance mantuvo la posición hasta que fue cerrada manualmente desde iOS siete minutos después de cruzar el SL esperado.

## Operacion afectada

| Campo | MySQL esperado | Binance real |
| --- | ---: | ---: |
| Dirección | SHORT | SHORT |
| Qty | 2.21 | 2.21 |
| Entry | 61.307 | 61.354 promedio ejecutado |
| SL | 62.45 | No existió orden STOP |
| TP | 58.97 | LIMIT `10048648288`, luego EXPIRED |
| Leverage | 3x | 3x |
| Cierre | inicialmente OPEN/stale | MARKET reduce-only manual |
| Exit | N/D antes de reconciliar | 62.565 |
| PnL | N/D antes de reconciliar | -2.67631 USDT |

## Linea de tiempo

| UTC | Evidencia |
| --- | --- |
| 2026-06-28 23:30:30.324 | Binance llena MARKET SELL SHORT `10048646628`. |
| 23:30:30.013-23:30:37.900 | Ejecución SL Monitor `81788` inicia con snapshot anterior: ETH y BTC, sin HYPE. |
| 23:30:33.150 | Se crea TP LIMIT `10048648288`. No se crea STOP. |
| 23:30:33.319-23:30:33.342 | Webhook `81789` guarda HYPE correctamente en `state.positions`. |
| 23:30:33.872-23:30:33.884 | Webhook `81790` confirma que HYPE aparece junto con ETH/BTC. |
| 23:30:37.900 | `81788` termina y persiste su snapshot antiguo después de cerrar ETH; sobrescribe el staticData que contenía HYPE. |
| 23:30:40.011 | `81791` procesa sólo BTC; HYPE ya no aparece. Cierra BTC y elimina el último elemento del estado. |
| 23:30:46.874 | `81791` termina en error Telegram HTML, después de ejecutar el cierre. |
| 23:30:50.011 | `81792` devuelve `no_positions_active`. Desde aquí HYPE queda sin monitor lógico. |
| 2026-06-29 02:40:00 | Primera vela 1m con máximo 62.463, por encima del SL 62.45. |
| 02:47:12.605 | Binance llena MARKET BUY reduce-only `10056048339`, client id `ios_*`, a 62.565. Cierre manual. |
| 03:40:12 | Position Guard reconcilia MySQL y Dashboard usando trades reales Binance. |

## Causa raiz

1. `Execute Trade` declaraba explícitamente que no colocaba SL en Binance y delegaba toda la protección al workflow monitor.
2. `SL Monitor` almacenaba posiciones en `workflow staticData`, susceptible a last-write-wins entre ejecuciones concurrentes.
3. Una ejecución programada comenzó antes del webhook de HYPE y finalizó después; su snapshot antiguo sobrescribió el estado nuevo.
4. No existía reconciliación independiente contra posiciones y órdenes Binance.
5. Dashboard/MySQL conservaron HYPE como OPEN después del cierre manual.

El error Telegram de `81791` no produjo la pérdida de HYPE: ocurrió al final, en `Telegram: Post-Trade Agent`. La desaparición ya era visible al comenzar esa ejecución. Sí convirtió una ejecución que había cerrado BTC correctamente en estado `error`.

## Errores de las ultimas 72 horas

| Ejecución | Workflow | Nodo | Error | Relación con HYPE |
| ---: | --- | --- | --- | --- |
| 78936 | SL Monitor | Telegram: Post-Trade Agent | HTML tag `20)` | No causal; cierre ya realizado. |
| 79121 | Advanced Bot | Telegram: Daily Report AI | Message too long | No causal. |
| 81440 | SL Monitor | Telegram: Post-Trade Agent | HTML tag `36` | No causal; cierre ya realizado. |
| 81791 | SL Monitor | Telegram: Post-Trade Agent | HTML tag `40` | Coincidente, no causal. |
| 83839 | Advanced Bot | Market Scanner | `read ETIMEDOUT` | Posterior; no abrió posición. |

En la ventana auditada, SL Monitor tuvo un gap máximo de 60 segundos durante reinicios y Trailing Manager 120 segundos. No hubo OOM ni evidencia de disco lleno durante el incidente.
El ciclo programado siguiente del Advanced Bot, ejecución `83957`, terminó correctamente entre `04:00:13` y `04:00:27 UTC`; confirma recuperación automática tras el timeout sin dejar el workflow bloqueado.

## Correccion implementada

### Protección al abrir

`Execute Trade` conserva el SL calculado y crea inmediatamente un `STOP_MARKET` nativo mediante `POST /fapi/v1/algoOrder`, usando `triggerPrice`, `closePosition=true`, Hedge Mode y `CONTRACT_PRICE`. Verifica el `algoId` antes de continuar al TP. Si la creación/verificación falla, cierra inmediatamente la posición recién abierta.

### Position Guard

Servicio independiente con polling de cinco segundos:

- consulta posiciones, órdenes normales y órdenes algo;
- compara Binance contra `trades.sl_price` y `trades.tp_price`;
- alerta inmediatamente si falta el stop nativo y espera una ventana configurable;
- cierra por MARKET solo si la posicion permanece sin proteccion al vencer la ventana;
- reconcilia cierres externos en MySQL/Dashboard;
- registra `position_guard_events`;
- envía alertas Telegram críticas;
- comprueba MySQL, Redis, Dashboard, n8n, Research, Learning, Binance, Telegram y ejecuciones recientes de workflows.

Tras la auditoria de responsabilidades, Position Guard no crea, reemplaza, modifica ni cancela SL/TP. La proteccion inicial pertenece exclusivamente a Execute Trade.

La orden nativa continúa existiendo en Binance si n8n, Dashboard, Docker o el host dejan de responder después de crearla.

### Dashboard

El snapshot de cuenta incorpora `/fapi/v1/openAlgoOrders`; el SL visual ahora procede de la protección real Binance cuando existe.

### Acceso n8n

Durante la validación se detectó que el editor devolvía una pantalla SPA 404 bajo `/n8n/` porque `base-path.js` declaraba `/`. nginx ahora entrega `/n8n/` como base del editor sin modificar rutas webhook.

## Reconciliacion aplicada

Trade MySQL `id=50`:

- `status=CLOSED`
- `exit_price=62.565`
- `pnl_usdt=-2.676310`
- `close_reason=MANUAL`
- `duration_minutes=197`
- `closed_at=2026-06-29 02:47:12 UTC`

Evento de auditoría: `DB_RECONCILED_CLOSED`, severity `CRITICAL`, action `CLOSE_DB_TRADE`, status `SUCCESS`.

## Validacion

- Payload STOP validado contra el contrato oficial y el SDK oficial Binance.
- Unit tests y simulación de stop faltante pasan en host y contenedor.
- No se abrió ninguna posición de prueba ni se envió una orden real durante la validación.
- Binance actual: cero posiciones, cero órdenes normales abiertas y cero órdenes algo abiertas.
- MySQL/Dashboard actual: cero trades abiertos.
- Position Guard: `enforce=true`, scan saludable cada cinco segundos.
- SL Monitor y Trailing Manager: activos y con ejecuciones recientes exitosas.
- Advanced Bot: ejecución programada `83957` exitosa después del timeout aislado `83839`.
- n8n, Dashboard, MySQL, Redis, Telegram y Position Guard saludables.

## Evidencia

- [Captura ejecución 81791](../screenshots/sl-monitor-execution-81791.png)
- [Evidencia estructurada](../reports/sl-incident-evidence-20260629.json)
- [Binance New Algo Order](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order)
- [SDK oficial Binance](https://github.com/binance/binance-connector-python)

## Limitacion verificable

La creación efectiva del STOP nativo sólo puede confirmarse contra una posición real futura. No se abrió una operación artificial para probarlo. El payload, la firma, el endpoint, la consulta de verificación y el fallback de cierre fueron probados sin enviar órdenes.
