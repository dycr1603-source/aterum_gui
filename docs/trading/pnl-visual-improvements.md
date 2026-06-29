# PnL Visual Improvements

Fecha: 2026-06-24

## Causa raiz

Habia rutas visuales donde el PnL negativo se formateaba asi:

```js
(pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(2)
```

Eso convertia una perdida como `-1.30` en `$1.30`, eliminando el signo negativo.

## Cambios realizados

Archivos modificados:

- `/home/aterum_gui/views/dashboard.js`

Se corrigio el formato de:

- PnL principal
- PnL final de trades cerrados
- PnL del panel de ejecucion
- Watchlist de posiciones abiertas
- Watchlist de historial
- Telemetria de sesion
- No realizado de cuenta
- KPI `No realizado`

Formato nuevo:

```text
+$2.57 (+1.34%)
-$1.22 (-0.58%)
+$0.12 (+0.03%)
```

## Badges

Se agrego badge visual al panel de PnL:

- `PROFIT`
- `LOSS`
- `BREAK EVEN`

Colores:

- verde para ganancias
- rojo para perdidas
- gris para break even

## Sin impacto en trading

No se modifico:

- ATR
- scoring
- trailing
- Risk Guard
- workflows
- ordenes Binance
- logica de entrada o salida

Los cambios son exclusivamente de transporte de datos de mercado y presentacion visual del dashboard.

## Evidencia

Validacion de sintaxis:

```text
node -c routes/account.js: OK
node -c views/dashboard.js: OK
docker compose config: OK
```

Validacion de stream:

```text
type=candle source=BINANCE_FUTURES_HTTP_KLINE volume=1779.972
type=price source=BINANCE_FUTURES_HTTP_MARK price=62852.33223188
```

## Resultado

El operador ahora puede distinguir inmediatamente:

- si la posicion esta en ganancia o perdida
- cuanto gana o pierde en dolares
- cuanto representa porcentualmente
- si el dato viene de una fuente viva
