# Realtime Chart Audit

Fecha: 2026-06-24

## Causa raiz

El dashboard actualizaba datos numericos desde `/api/dashboard/state`, pero el grafico dependia solo del stream `@kline_1h` y el frontend ignoraba cualquier mensaje que no fuera `type: "candle"`.

Desde este host, Binance Futures WebSocket abre conexion pero no entrega eventos de mercado de forma confiable. Prueba directa:

- `wss://fstream.binance.com/ws/btcusdt@markPrice@1s`: conexion abierta, sin mensajes durante la ventana de prueba.
- `wss://stream.binance.com:9443/ws/btcusdt@trade`: entrega mensajes, confirmando que WebSocket outbound funciona.

## Cambios realizados

Archivos modificados:

- `/home/aterum_gui/routes/account.js`
- `/home/aterum_gui/views/dashboard.js`
- `/home/docker-compose.yml`

Backend:

- El canal local `/ws?channel=market&symbol=...` ahora intenta Binance Futures combinado:
  - `@kline_1h`
  - `@markPrice@1s`
- Se agrego fallback automatico de solo lectura si Futures WS queda silencioso:
  - `/fapi/v1/premiumIndex`
  - `/fapi/v1/klines?interval=1h&limit=1`
- El fallback emite por el mismo WebSocket local:
  - `type: "price"`
  - `type: "candle"`

Frontend:

- El grafico ahora procesa `type: "price"` y actualiza sin recargar:
  - ultima vela
  - close/high/low de la vela activa
  - linea de precio vivo
  - precio del header
  - PnL/R multiple si hay posicion abierta
- El grafico sigue procesando `type: "candle"` para OHLC y volumen.
- El panel de volumen se actualiza si esta visible.
- Se muestra timestamp vivo: `Última actualización: HH:MM:SS UTC`.
- El indicador LIVE se activa cuando llegan datos del stream local.

## Evidencia

Prueba desde el contenedor dashboard:

```text
{"type":"candle","close":62855.6,"volume":1779.972,"source":"BINANCE_FUTURES_HTTP_KLINE"}
{"type":"price","price":62852.33223188,"source":"BINANCE_FUTURES_HTTP_MARK"}
{"type":"candle","close":62855.6,"volume":1779.992,"source":"BINANCE_FUTURES_HTTP_KLINE"}
{"type":"price","price":62849.64744928,"source":"BINANCE_FUTURES_HTTP_MARK"}
```

Servicios tras el despliegue:

- `dashboard`: healthy
- `aterum_gui`: healthy
- `n8n`: healthy
- `mysql`: healthy
- `redis`: healthy
- `nginx`: levantado

## Resultado

El dashboard ya no depende de recargar la pagina ni de esperar cierre de vela. El precio vivo mueve la ultima vela y mantiene el PnL visual sincronizado con el precio de mercado.
