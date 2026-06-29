# Research Learning Implementation

Fecha: 2026-06-27 UTC

## Resultado

Research ya participa en la decisión operativa. El modo actual es `enforce`.

Antes de una entrada existen dos barreras:

1. `Risk Guard` consulta la protección de capital antes del scanner.
2. `Research Learning Gate` recalcula el score antes de `Position Sizer` en las rutas normal y visual.

No se modificaron ATR, RSI, trailing, SL, TP, indicadores ni órdenes abiertas.

## Evidencia analizada

- `research_reports`: 7 informes, del 2026-06-22 al 2026-06-27.
- `ai_recommendations`: 82.
- `recommendation_reviews`: 162 revisiones históricas.
- `trades`: 38.
- `trade_closes`: 37.
- `post_trade_analysis`: 29.
- `scan_events`: 711.
- `trade_rejections`: 454.

Patrones repetidos en los siete informes: entry/INITIAL, drawdown, expectancy, profit factor, selectividad y HIGH_VOLATILITY. ETHUSDT apareció en 7 informes; SOLUSDT y ZECUSDT en 6.

## Errores estructurales corregidos

### Hora incorrecta

Research agrupaba resultados con `trade_closes.closed_at`. Eso atribuía el resultado a la hora de cierre, no a la entrada que se estaba evaluando.

Se corrigieron:

- `/api/research/hours`
- inferencia de evidencia horaria
- ventanas del Review Engine

Todos usan ahora `trades.opened_at`.

Evidencia del cambio:

| Sesión de entrada | Trades | WR | Expectancy |
|---|---:|---:|---:|
| 00-04 | 9 | 11.1% | -2.889 |
| 04-08 | 8 | 75.0% | +1.441 |
| 08-12 | 4 | 50.0% | -0.240 |
| 12-16 | 9 | 44.4% | -0.228 |
| 16-20 | 4 | 50.0% | +0.440 |
| 20-24 | 3 | 66.7% | +2.567 |

La recomendación de prohibir `04-08 UTC` estaba basada en cierres y quedó descartada. La sesión realmente penalizada es `00-04 UTC`.

### Validaciones sin implementación

El Review Engine anterior comparaba períodos globales aunque una recomendación nunca hubiera sido aplicada. Eso podía marcarla `validated` sin relación causal.

Ahora sólo revisa una recomendación cuando:

- `implementation_status = implementada`
- existe `implemented_at`
- pasó al menos un día
- hay al menos 8 trades antes y 8 después

Una recomendación rechazada queda `descartada` y no participa en el motor.

## Motor de pesos

Tablas nuevas:

- `learning_config`
- `learning_rules`
- `learning_decisions`
- `learning_runs`

Fórmula aplicada:

```text
Final Decision Score = Base AI Score
  * Research Factor
  * Historical Symbol Factor
  * Historical Setup Factor
  * Historical Session Factor
  * Historical Regime Factor
  * Historical Score Band Factor
  * Historical Combination Factor
  * Review Engine Factor
  * Post Trade Factor
```

Cada decisión guarda factores, reglas, muestra, evidencia, score anterior, score final, límite y motivo.

Configuración persistida en MySQL:

- muestra mínima para influir: 8
- muestra mínima para bloquear: 20
- peso por dimensión: 0.85 a 1.12
- factor compuesto: 0.70 a 1.30
- circuit breaker diario: 3% del balance
- circuit breaker semanal: 6%
- drawdown máximo: 10%
- pérdidas consecutivas globales: 4
- pérdidas consecutivas por símbolo/setup/sesión: 4
- cooldown de rachas: 24 horas
- bloqueo aprendido máximo antes de volver a reducción: 72 horas
- ventana móvil de drawdown: 7 días

## Reglas activas

| Dimensión | Regla | Acción | Peso | n | Expectancy |
|---|---|---|---:|---:|---:|
| régimen | TRENDING | reducir | 0.941 | 26 | -0.085 |
| régimen | HIGH_VOLATILITY | reducir | 0.968 | 11 | -0.529 |
| score | 80-89 | reducir | 0.944 | 14 | -0.948 |
| score | 100 | priorizar | 1.021 | 13 | +0.792 |
| sesión | 00-04 | reducir | 0.946 | 9 | -2.889 |
| sesión | 04-08 | priorizar | 1.026 | 8 | +1.441 |
| sesión | 12-16 | neutral | 0.985 | 9 | -0.228 |
| setup | TRENDING / CONFIRMS / BEARISH | reducir | 0.966 | 18 | -0.165 |
| setup | HIGH_VOLATILITY / CONFIRMS / BEARISH | reducir | 0.966 | 8 | -1.226 |
| símbolo | ETHUSDT | reducir | 0.975 | 12 | -0.093 |
| símbolo | BTCUSDT | neutral | 0.990 | 8 | -0.129 |

No hay blacklist dura aprendida: ningún símbolo perdedor alcanza 20 cierres con los tres criterios negativos. ZECUSDT, REUSDT, XRPUSDT y HYPEUSDT siguen en observación para evitar decisiones basadas en 1-3 trades.

## Recomendaciones incorporadas

Seis recomendaciones tienen concordancia entre texto y evidencia operativa:

- `#72`: pérdidas concentradas en ETHUSDT/ZECUSDT. Sólo ETHUSDT influye; ZECUSDT no alcanza muestra.
- `#73`: debilidad de HIGH_VOLATILITY. Se reduce el régimen; no se elimina.
- `#88`: filtro ETHUSDT/ZECUSDT. Se aplica peso a ETHUSDT, no blacklist.
- `#94`: ETHUSDT/ZECUSDT problemáticos. Misma aplicación conservadora.
- `#102`: evitar 00-08. Se implementó únicamente la parte corroborada `00-04`; `04-08` se prioriza.
- `#140`: score 80-89 negativo y score 100 positivo. Se reduce 80-89 y se prioriza 100 sin fijar un umbral hardcodeado de 92.

## Descartadas y pendientes

- 31 descartadas.
- 45 en prueba.
- 6 implementadas.
- impacto acumulado posterior a implementación: pendiente (`0.000` hasta reunir muestra nueva).

Los impactos históricos calculados antes de `implemented_at` fueron anulados para evitar atribución causal falsa.

Ejemplo descartado: `#138`, prohibir `04-08 UTC`. Los datos por hora de entrada muestran 75% WR y expectancy +1.441, por lo que contradice la evidencia real.

Las recomendaciones sobre ZECUSDT, REUSDT, XRPUSDT, HYPEUSDT, `20-24 UTC` y `HIGH_VOLATILITY / CONFIRMS / NEUTRAL` permanecen sin aplicación por muestra insuficiente.

## Protección de capital

Estado al finalizar:

- balance observado: $192.87
- PnL diario: -$10.51 (-5.45%)
- PnL 7 días: -$8.02 (-4.16%)
- drawdown: -$23.64 (-12.26%)
- racha global: 3 pérdidas

Las nuevas entradas están detenidas por límite diario y drawdown. No se cierran posiciones existentes.

## Workflows modificados

### Advanced AI Trading Bot v2 - Clean

- Workflow ID: `Cz4TfvaVAygWGRJm`
- Versión activa: `bf8e8d4d-ceb9-4364-94e5-2fb573a9c582`
- `Risk Guard`: consulta circuit breakers persistidos antes del scanner.
- `Research Learning Gate`: ruta normal antes de `If: AI Approves`.
- `Research Learning Gate Image`: ruta visual antes de `If: AI Approves1`.
- `Daily Analysis Report`: informa reglas implementadas y evidencia insuficiente.

### Recommendation Review Engine

- Workflow ID: `RecommendationReviewEngine`
- Versión activa: `a935c2d9-bcb1-4c66-8be6-95a07802ba9e`
- Nodo nuevo: `Rebuild Learning Rules` después de revisar recomendaciones.

Backup previo: `/home/docs/n8n-database-before-research-learning-20260627.sqlite`.

## API

- `POST /db/learning/rebuild`
- `POST /api/learning/decision`
- `GET /api/learning/summary`
- `GET /api/learning/rules`
- `GET /api/learning/decisions`
- `GET /api/learning/capital-status`

## Pruebas controladas

No se enviaron órdenes a Binance.

| Caso | Lógica anterior | Learning Engine |
|---|---|---|
| ETHUSDT, score 84, mínimo 70, TRENDING, 12-16 | aprobaría por score | rechazado: score final 65.52 |
| REUSDT, score 87, HIGH_VOLATILITY, 00-04 | aprobaría por score | detenido por 5 pérdidas consecutivas del setup y sesión |
| BTCUSDT, score 100, TRENDING, 04-08, balance neutralizado | aprobaría | aprobado con score final 92.32 |
| Candidato actual con balance real | podía continuar hasta filtros posteriores | detenido antes del scanner por -5.45% diario y -12.26% drawdown |

La GUI `/research` muestra reglas, pesos, muestras, evidencia, protección de capital, recomendaciones y decisiones recientes.

Validación programada real:

- ejecución n8n: `68359`
- inicio: `2026-06-27 19:45:13 UTC`
- fin: `2026-06-27 19:45:18 UTC`
- estado: `success`
- nodos ejecutados: `Risk Guard`, `AGENTE DE MERCADO`, `If: Risk OK`, `Telegram: Risk Halt`
- `Market Scanner`, chart, Position Sizer y Execute Trade no se ejecutaron
