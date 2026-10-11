# Investigación de la variante rápida — 10 de octubre de 2026

**Resultado: ninguna configuración superó el criterio de promoción.** La variante rápida permanece preparada en el código local, pero `manualActivation.enabled=false`. Esta investigación no activó órdenes reales ni modificó los contenedores o la base de n8n. Los parámetros descritos abajo son diagnósticos, **no una estrategia seleccionada para producción**.

## Historial real y atribución de costos

Se revisaron las 63 posiciones cerradas registradas entre el 15 de agosto y el 9 de octubre de 2026, 184 decisiones JEV y 5.521 oportunidades de mercado. Dos posiciones SOL importadas manualmente tenían PnL registrado cero incompatible con sus precios; se excluyeron del resultado atribuible al bot. Quedan 61 posiciones, de las que 50 se pudieron vincular a una decisión JEV en los 15 minutos anteriores y 47 tienen características técnicas. No se reconstruyeron decisiones JEV que no quedaron registradas.

En **55 de las 61** posiciones se verificaron fills, comisiones y funding completos con Binance: PnL neto **−9,00 USDT**, win rate **36,36 %**, Profit Factor **0,794**, expectativa **−0,164 USDT/trade**, duración media **8,59 h** y mediana **5,02 h**. Para las otras seis faltan datos suficientes para una atribución exacta. Al estimarles 0,1 % de comisión por lado y una reserva de funding del 0,1 %, las 61 suman **−18,63 USDT** (win rate **34,43 %**, PF **0,692**, expectativa **−0,305 USDT/trade**, media **9,13 h**). Ese total es una estimación mixta, no el saldo real confirmado de la cuenta. El drawdown de trades cerrados de esa reconstrucción es 3,31 % sobre una base normalizada y **omite** excursiones intratrade; no es el drawdown real de la cuenta.

El reparto cronológico de las 61 entradas, usando la estimación cuando falta atribución, revela un cambio de régimen y una muestra pequeña:

| Tramo de entradas | Trades | Neto USDT | Win rate | PF | Media de duración |
| --- | ---: | ---: | ---: | ---: | ---: |
| Primeros 36 | 36 | +0,77 | 41,67 % | 1,049 | 8,12 h |
| Siguientes 12 | 12 | −16,64 | 8,33 % | 0,033 | 3,55 h |
| Últimos 13 | 13 | −2,76 | 38,46 % | 0,900 | 17,09 h |

Los intervalos por fecha de entrada pueden solaparse porque algunas posiciones coexistieron. Las pérdidas no proceden solo de posiciones largas: las ocho de menos de una hora perdieron **−4,25 USDT** y las 24 de una a seis horas **−9,63 USDT**; las 20 de 12 horas o más sumaron **+1,30 USDT**. Son asociaciones observacionales, no evidencia para mantener operaciones largas. La confianza JEV tampoco mostró una separación fiable en esta muestra: ≥0,8, 17 trades y −3,27 USDT; 0,6–0,8, 27 y −4,96; <0,6, seis y +1,56. No se promovió un umbral de confianza por estos tamaños y por el sesgo de selección de entradas ejecutadas.

## Experimentos y supuestos

Se descargaron y verificaron por checksum datos públicos de **ocho activos líquidos predefinidos**, sin seleccionarlos por rendimientos futuros: 1h durante un año, 15m durante 180 días, 5m durante 90 días y 1m durante 14 días. El conjunto común de 90 días va del **3 de julio al 1 de octubre de 2026**; entrenamiento de 54 días, validación de 18 y evaluación final de 18. Las señales usan velas ya cerradas, ejecución en apertura posterior con una vela de latencia, prioridad del stop cuando un OHLC toca stop y TP en la misma vela, y salida de gestión a la siguiente apertura.

Se probaron **482 configuraciones completas** en 1h/15m/5m: consenso de 5/6 indicadores, tendencia, ruptura, pullback, reversión y cruces EMA/RSI y MACD/RSI; 37 pares de indicadores en 1h/15m; stops de 1,25/1,75/2/3 ATR; objetivos de 1,3/1,8/2 veces riesgo y un mínimo neto de 1,1R después de costos; permanencias máximas de 3/6/12 h; gestión fija o reversión; y 5/8/10x. Se incluyeron cuatro configuraciones de 1m como exploración independiente de 14 días. Además se reprodujeron **las 61 entradas reales** con 144 combinaciones de salida: stop anterior o basado en 1/1,5/2,5 ATR, cuatro objetivos, tres tiempos máximos y tres modos de gestión (fija, reversión o pérdida estancada). El presupuesto de esta ronda fue de **630 configuraciones distintas**; se detuvo cuando ninguna pasó los umbrales de entrenamiento y las muestras finales refutaron incluso los mejores diagnósticos.

En el backtest integral se cargaron 0,1 % de comisión taker por lado, 5 bps de slippage por ejecución, 2 bps de spread total supuesto (1 bps por lado) y eventos históricos de funding. La prueba de estrés elevó comisión a 0,15 % por lado, slippage a 10 bps y spread total a 4 bps. El simulador limitó tres posiciones, 90 % del capital **propio** como margen, 10 % de reserva y 35 % por posición, con comprobación de margen de mantenimiento y riesgo hasta el stop. El capital inicial simulado fue de **1.000 USDT, reiniciado en cada tramo**; el nocional con apalancamiento no se contó como capital propio. La condición previa para promoción fue al menos 25 operaciones en entrenamiento, PnL neto positivo, PF >1, drawdown <15 %, tres activos y sin disparar el freno de riesgo, más validación y evaluación final positivas.

Ninguna de las 482 configuraciones cumplió esa condición en entrenamiento. Solo para entender por qué, se congeló la mejor según la función de ranking pese a no calificar: **reversión en 1h, LONG/SHORT, RVOL ≥1, RSI ≤30 con Bollinger bajista para LONG o RSI ≥70 con Bollinger alcista para SHORT, stop estructural o 2 ATR, objetivo 2R con piso neto 1,1R, máximo 12 h, gestión de reversión a 0,75R, 5x**. La limitación de cartera descrita arriba se mantuvo. Esta configuración no fue integrada como estrategia activa.

| Simulación sobre 1.000 USDT iniciales por tramo | Trades | Neto USDT | Win rate | PF | Máx. DD | Duración media | Expectativa/trade |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Diagnóstico, entrenamiento 54 días | 57 | +61,48 | 56,14 % | 1,118 | 17,95 % | 8,21 h | +1,08 |
| Diagnóstico, validación 18 días | 8 | −161,65 | 50,00 % | 0,240 | 16,91 % | 6,38 h | −20,21 |
| Diagnóstico, evaluación final 18 días | 12 | −95,51 | 33,33 % | 0,447 | 15,07 % | 6,33 h | −7,96 |
| Mismo diagnóstico, costos de estrés, final | 12 | −137,08 | 33,33 % | 0,296 | 17,09 % | 6,33 h | −11,42 |
| Proxy técnico de estrategia original, final | 21 | −103,93 | 57,14 % | 0,632 | 15,11 % | 8,52 h | −4,95 |
| Proxy técnico de variante rápida actual, final | 18 | −106,88 | 22,22 % | 0,248 | 14,26 % | 3,17 h | −5,94 |

El entrenamiento del diagnóstico ya incumplió el límite de drawdown y disparó el freno; la validación y la evaluación final fueron negativas. La pequeña mejora aparente del PnL final frente al proxy original no es una ventaja repetible: tiene menos operaciones, menor PF y un fuerte deterioro frente al estrés. Los proxies reproducen reglas técnicas con la misma ventana y costos, **no reproducen las llamadas históricas de JEV ni los fills reales de Binance**. Por ello no son una comparación exacta con la cuenta real. Las cuatro variantes exploratorias de 1m perdieron en entrenamiento, validación y evaluación final.

El experimento de solo salidas, manteniendo las entradas y cantidades realmente registradas, tampoco produjo un ganador. Ninguna de las 144 salidas pasó entrenamiento. La menos negativa allí (stop anterior, TP 1,6R, límite 3 h, sin salida por reversión) produjo **−1,48 / −8,99 / −11,25 USDT** en los tramos de 36/12/13 entradas, con PF **0,880 / 0,201 / 0,036** y permanencias medias **2,64 / 2,34 / 3,05 h**. Es más rápida, pero pierde dinero; no se adoptó.

## Walk-forward y límites de inferencia

La selección walk-forward vuelve a puntuar la cuadrícula solo con datos previos a cada tramo de prueba: 36 días → 18 días y 54 días → 18 días. El resultado reproducible se guarda en `.local/strategy-v2/fast-walk-forward.json`. **No hubo una configuración admisible en ninguno de los dos pliegues**; el mejor diagnóstico de 1h/reversión perdió **−161,15 USDT** en el primer tramo de prueba (23 trades, PF 0,218) y **−161,65 USDT** en el segundo (ocho trades, PF 0,240). La ventana final de 18 días del backtest principal se evaluó después de congelar el diagnóstico, aunque algunas fechas y trades recientes ya habían sido vistos en el replay anterior; no debe considerarse una prueba prospectiva completamente intacta.

No existe un archivo que permita regenerar fielmente todas las deliberaciones de JEV ni el universo elegible completo en cada instante histórico. Tampoco se guardó el spread real, profundidad histórica o posición precisa en cola; el spread y el slippage se modelaron. La simulación de liquidación usa un margen de mantenimiento conservador, pero no reproduce todas las reglas, filtros de lotes y ejecuciones parciales de Binance. El conjunto de ocho activos evita selección posterior por retorno, pero no representa todos los 175+ elegibles. Las inferencias de confianza, regímenes y duración en los 61 trades sufren tamaño de muestra pequeño y selección de entradas ya aceptadas. Nada aquí demuestra rentabilidad futura.

## Código y reproducción

La investigación añadió exportación y auditoría histórica, descarga de velas, un motor de backtest offline con reglas de entrada, spread y cartera de tres posiciones, búsqueda parametrizada, walk-forward y replay de salidas. No se transfirieron parámetros del diagnóstico a la configuración operativa. Los archivos de datos y resultados están en `.local/strategy-v2/` (ignorados por Git); los scripts no envían órdenes. Para reproducir con el historial local disponible:

```bash
node scripts/strategy/export-research-history.js
node scripts/strategy/audit-current-history.js
node scripts/strategy/analyze-research-history.js
node scripts/strategy/download-fast-research.js
node scripts/strategy/download-trade-bars.js
node --max-old-space-size=4096 scripts/strategy/fast-research.js
node --max-old-space-size=4096 scripts/strategy/fast-walk-forward.js
node scripts/strategy/replay-all-exits.js
npm run test:strategy
npm run test:workflow
npm run test:execution
npm run test:offline
npm run build
```

La auditoría requiere credenciales de Binance **solo de lectura de trades** disponibles en el entorno local. Las descargas requieren acceso a datos públicos de Binance. Los backtests y replays usan los archivos ya descargados y no modifican operaciones reales.
