# Auditoria cuantitativa por ablacion

Fecha: 2026-07-02.

No se modificaron decisiones, reglas, workflows, ordenes ni datos de produccion. El estudio usa una exportacion read-only y mercado posterior real.

## Respuesta corta

Con los datos disponibles no se puede demostrar edge estadistico para ningun modulo. Si se observan aportes descriptivos:

- Learning mejoro la seleccion en ambos replays, pero fue entrenado con el mismo historial y la cohorte V2 solo contiene seis ciclos maduros. No es evidencia causal.
- Intelligence cambio muy pocas selecciones y su aparente aporte no es significativo.
- Correlation Filter y Portfolio Capacity evitaron grupos con expectancy negativa en el historico exploratorio, pero los intervalos contienen cero.
- Research/Review no cambio una sola seleccion en ninguna cohorte. Su aporte marginal operativo observado fue exactamente cero.
- Macro cambio varias selecciones y el bot habria rendido mejor sin el modulo, pero el intervalo de confianza cruza cero ampliamente.
- Position Sizer aumento PnL sobre los cinco cierres V2, a cambio de casi duplicar el drawdown monetario. La muestra es insuficiente.
- Risk Manager no es identificable contrafactualmente: cuando bloquea antes del scan, no persiste candidatos ni precios teoricos.

La arquitectura no debe simplificarse usando estos resultados como prueba definitiva. La accion correcta es ampliar shadow logging y repetir el mismo estudio con al menos 30-50 ciclos independientes por politica.

## Metodologia

### Cohortes

1. `currentPolicy`: pipeline V2 homogeneo desde `2026-07-01 15:51:08 UTC`. Seis ciclos tenian seis horas completas de mercado posterior.
2. `exploratoryAll`: 41 ciclos maduros entre 2026-06-30 y 2026-07-02. Mezcla versiones de scoring/Learning; sirve para detectar magnitud, no para afirmar causalidad.

### Outcome comun

Para comparar entry modules bajo la misma salida:

- velas Binance Futures de 5 minutos;
- horizonte de seis horas;
- entry persistido en `market_opportunities.metrics`;
- SL a `1.5 ATR`, equivalente a `-1R`;
- TP a `2R`;
- si SL y TP aparecen en la misma vela, se asigna SL;
- si ninguno ocurre, se marca al cierre de seis horas;
- PnL estandarizado: 1% de `$192.6671`, es decir `$1.926671` por R.

Este replay mide seleccion. No reproduce trailing, Time Lock, slippage, fees ni un portfolio contrafactual simultaneo. Por eso tambien se presenta el sizing real por separado.

### Interpretacion del delta

`delta = expectancy sin modulo - expectancy del sistema completo`.

- delta negativo: el modulo aporto positivamente en la muestra;
- delta positivo: el modulo perjudico en la muestra;
- intervalo 95% que contiene cero: efecto no demostrado.

El bootstrap se hizo por ciclo, con 5,000 remuestreos. Los candidatos dentro de un mismo ciclo no se consideran observaciones independientes.

## Ablacion V2

| Sistema | Ops | WR | Exp R | PF | PnL R | PnL 1% | DD R | Cambios | Delta Exp R | IC 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Completo | 6 | 33.33% | -0.2103 | 0.5193 | -1.2616 | -$2.43 | -2.4172 | 0 | 0 | 0 |
| Sin Macro | 6 | 50.00% | +0.0982 | 1.5466 | +0.5894 | +$1.14 | -0.6610 | 3 | +0.3085 | [-0.2853, +0.9894] |
| Sin Intelligence | 6 | 16.67% | -0.3529 | 0.3121 | -2.1174 | -$4.08 | -2.4172 | 1 | -0.1426 | [-0.4279, 0] |
| Sin Learning | 6 | 0.00% | -0.7362 | 0 | -4.4172 | -$8.51 | -4.4172 | 5 | -0.5259 | [-1.1795, -0.0670] |
| Sin Research/Review | 6 | 33.33% | -0.2103 | 0.5193 | -1.2616 | -$2.43 | -2.4172 | 0 | 0 | [0, 0] |
| Sin Correlation | 6 | 33.33% | -0.2103 | 0.5193 | -1.2616 | -$2.43 | -2.4172 | 0 | 0 | [0, 0] |
| Sin Portfolio Capacity | 6 | 33.33% | -0.2103 | 0.5193 | -1.2616 | -$2.43 | -2.4172 | 0 | 0 | [0, 0] |

Learning es el unico efecto cuyo bootstrap V2 no contiene cero, pero `n=6` y sus reglas proceden del mismo historial usado para generar el filtro. Se trata de una alerta prometedora, no de validacion fuera de muestra.

## Ablacion exploratoria

| Sistema | Ops | WR | Exp R | PF | PnL R | PnL 1% | DD R | Cambios | Delta Exp R | IC 95% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Completo | 40 | 47.50% | +0.0152 | 1.0411 | +0.6068 | +$1.17 | -3.5605 | 0 | 0 | 0 |
| Sin Macro | 40 | 52.50% | +0.1494 | 1.5108 | +5.9753 | +$11.51 | -2.9077 | 5 | +0.1342 | [-0.0110, +0.3372] |
| Sin Intelligence | 40 | 45.00% | -0.0062 | 0.9836 | -0.2490 | -$0.48 | -3.5605 | 1 | -0.0214 | [-0.0642, 0] |
| Sin Learning | 40 | 42.50% | -0.0637 | 0.8460 | -2.5488 | -$4.91 | -4.6914 | 5 | -0.0789 | [-0.1970, 0] |
| Sin Research/Review | 40 | 47.50% | +0.0152 | 1.0411 | +0.6068 | +$1.17 | -3.5605 | 0 | 0 | [0, 0] |
| Sin Correlation | 40 | 50.00% | +0.0016 | 1.0040 | +0.0621 | +$0.12 | -4.1435 | 4 | -0.0136 | [-0.0921, +0.0351] |
| Sin Portfolio Capacity | 41 | 46.34% | +0.0090 | 1.0245 | +0.3675 | +$0.71 | -3.5605 | 1 | -0.0058 | [-0.0175, 0] |

### Aporte marginal observado

| Modulo | Aporte Exp R observado | Selecciones afectadas | Evidencia |
| --- | ---: | ---: | --- |
| Macro | -0.1342 | 5/41 | Posible dano; no significativo |
| Intelligence | +0.0214 | 1/41 | Efecto muy pequeno; no significativo |
| Learning | +0.0789 | 5/41 | Positivo descriptivo; no fuera de muestra |
| Research/Review | 0 | 0/41 | Sin aporte operativo observable |
| Correlation Filter | +0.0136 | 4/41 | Positivo pequeno; no significativo |
| Portfolio Capacity | +0.0058 | 1/41 | Positivo pequeno; no significativo |

Research puede alterar decimales del score, pero no modifico el simbolo seleccionado, la cantidad de operaciones ni ningun outcome en las dos cohortes.

## Position Sizer

Comparacion sobre los mismos cinco cierres V2 reales:

| Sizing | Ops | WR | Expectancy USD | PF | PnL | Max DD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dinamico real | 5 | 80% | +$0.3657 | 1.4987 | +$1.8284 | -$3.6666 |
| Fijo 1% | 5 | 80% | +$0.2002 | 1.5196 | +$1.0011 | -$1.9267 |

El sizing dinamico agrego `$0.8273` de PnL, pero empeoro el drawdown en `$1.7399` y redujo ligeramente PF. Aumento retorno y riesgo casi en la misma direccion. Con cinco operaciones no se puede afirmar que convierta calidad en mejor retorno ajustado al riesgo.

## Embudo completo

### Historico persistido

| Etapa | Instancias | Conversion | Eliminadas/diferidas |
| --- | ---: | ---: | ---: |
| Universe | 26,200 | 100% | - |
| Elegibles por contrato/liquidez/movimiento | 9,013 | 34.40% | 17,187 |
| Refresh batch por freshness | 1,557 | 17.27% de elegibles | 7,456 diferidas |
| Evaluadas profundamente | 1,461 | 93.83% de refresh | 96 no evaluadas/completadas |
| Seleccionadas | 46 | 3.15% de evaluadas | 1,415 |

Motivo primario dentro de las 1,461 evaluadas:

| Motivo | Cantidad | % |
| --- | ---: | ---: |
| Technical Score | 584 | 39.97% |
| Lower Portfolio Rank | 536 | 36.69% |
| Learning Hard Block | 168 | 11.50% |
| Selected | 46 | 3.15% |
| Score Below Threshold tras ajustes | 45 | 3.08% |
| Market Data Unavailable | 26 | 1.78% |
| Portfolio Correlation | 25 | 1.71% |
| Max Portfolio Positions | 19 | 1.30% |
| Position Already Open | 8 | 0.55% |
| Otros | 4 | 0.27% |

### Pipeline V2

| Etapa | Instancias |
| --- | ---: |
| Universe | 6,288 |
| Elegibles | 2,255 |
| Refrescadas/evaluadas | 384 |
| Technical Score | 166 eliminadas |
| Learning Hard Block | 63 eliminadas |
| Score Below Threshold | 16 eliminadas |
| Market Data Unavailable | 6 eliminadas |
| Position Already Open | 2 eliminadas primarias |
| Lower Rank | 119 no seleccionadas |
| Seleccionadas | 12 |
| Aperturas Binance verificadas | 9 |

El funnel todavia no persiste una causa unica entre seleccion y las tres aperturas faltantes. Esa discontinuidad debe instrumentarse antes de atribuirla a Position Sizer, Entry Gate o estado operativo.

### Risk Manager retenido por n8n

n8n conserva solo las 13 ejecuciones mas recientes del workflow principal en la ventana auditada:

- 11/13 (`84.62%`) fueron detenidas por `PORTFOLIO_RISK_FULL` antes del scan.
- 2/13 (`15.38%`) pasaron y abrieron trades verificados.
- No hubo otro hard blocker de Risk Manager en esa muestra.

No es posible calcular WR/PF de esas 11 oportunidades porque el sistema no ejecuto Opportunity Discovery y, por tanto, no persistio candidato, entry, ATR, SL o TP. Cualquier cifra seria inventada.

## Operaciones de alta calidad rechazadas

Definicion: score tecnico `>=80`, direccion no neutral, no seleccionada y seis horas maduras.

### Historico exploratorio

| Motivo | Candidatos | WR | Exp R | PF | PnL R | Targets 2R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Lower Rank | 141 | 45.39% | -0.0874 | 0.7885 | -12.3241 | 9 |
| Learning Hard Block | 128 | 42.19% | -0.1766 | 0.6081 | -22.6004 | 2 |
| Correlation | 19 | 36.84% | -0.2957 | 0.3641 | -5.6187 | 1 |
| Max Positions | 6 | 33.33% | -0.2001 | 0.5221 | -1.2004 | 0 |
| Position Already Open | 6 | 16.67% | -0.4114 | 0.2231 | -2.4686 | 0 |

Los filtros eliminaron algunas ganadoras, pero cada grupo agregado fue negativo. Esto favorece conservar ranking, correlation y Learning mientras se valida, no retirarlos por ver ejemplos aislados.

### V2 homogeneo

Hubo 23 candidatos high-quality rechazados, todos por `LEARNING_HARD_BLOCK`:

- WR: `26.09%`;
- expectancy: `-0.5188R`;
- PF: `0.1169`;
- PnL: `-11.9315R`;
- targets 2R: `0`;
- ganadores de al menos 1R: `0`.

Son 23 candidatos correlacionados dentro de seis ciclos, no 23 trades independientes. Aun asi, en esta ventana el bloqueo 80-89 evito perdidas en lugar de destruir edge.

## Eficiencia del Portfolio Manager

Snapshot Binance verificado a las `07:14:34 UTC`, despues de restaurar servicios:

| Metrica | Valor |
| --- | ---: |
| Equity | $197.11 |
| Margen usado | $54.07 (27.43%) |
| Margen disponible | $139.16 |
| Riesgo vivo | $9.4145 (4.7762%) |
| Limite de riesgo | $9.8555 (5%) |
| Riesgo libre | $0.4411 (0.2238%) |
| Posiciones | 3 |

El `72.57%` de margen no utilizado no era capacidad de riesgo. El portafolio estaba al `95.52%` de su presupuesto de perdida. Abrir otra posicion normal habria excedido el limite aunque existiera margen.

En el snapshot anterior de las `06:17 UTC`, `USELESSUSDT` ya aportaba riesgo vivo cero y su STOP bloqueaba aproximadamente `$0.5895` de beneficio (`0.3038%` del equity de ese momento). Incluso acreditando de forma agresiva el 100% de ese beneficio:

- riesgo libre actual: `0.1483%`;
- credito protegido maximo: `0.3038%`;
- capacidad total teorica: `0.4521%`;
- riesgo minimo configurado por trade: `0.5%`.

Ni siquiera el modelo agresivo habria habilitado una entrada adicional. Con haircut de 50%, la capacidad seria aproximadamente `0.3002%`.

### Modelo superior evaluado

El modelo actual basado en riesgo vivo ya es superior a contar posiciones o mirar margen. La extension razonable seria:

`capacidad = maxRisk - openRisk + haircut * verifiedProtectedProfit`

con estas restricciones:

- solo STOP confirmado por Binance;
- haircut maximo 25-50%;
- credito limitado por slippage/gap reserve;
- nunca usar MFE ni PnL flotante sin proteccion;
- no bajar el minimo por trade solo para consumir margen.

En el snapshot de las `06:17 UTC` esta extension no cambiaba la decision. En el snapshot de `07:14 UTC` ya no habia beneficio protegido utilizable y la capacidad libre seguia debajo del minimo de `0.5%`. Por tanto, no existe evidencia de que agregar credito por beneficio protegido mejore utilizacion ahora.

## Incidente de rate limit durante la auditoria

La descarga inicial de klines historicos compartio IP publica con produccion y, sumada al polling operativo existente, provoco una prohibicion temporal de Binance.

- Se detuvieron inmediatamente las descargas.
- `n8n` y `position_guard` se pausaron para impedir que los reintentos extendieran el bloqueo.
- No se enviaron ordenes desde el replay; solo se consultaron endpoints publicos de klines.
- Los servicios se restauraron despues de expirar la ventana.
- A las `07:14:34 UTC`, `/portfolio-capacity` volvio a responder `200` con datos reales.
- `n8n` y `position_guard` quedaron `healthy`.
- El script quedo limitado a una solicitud serial cada 750 ms y aborta ante `418/429`.

## Veredicto por modulo

| Modulo | Estado cuantitativo |
| --- | --- |
| Macro | Candidato a shadow; posible efecto negativo, no demostrado |
| Intelligence | Mantener; efecto pequeno y no demostrado |
| Learning | Mantener con shadow paralelo; aparente aporte positivo, alto riesgo de in-sample bias |
| Research/Review | No aporta seleccion observable; debe quedar como hipotesis hasta validacion |
| Portfolio Manager | Mantener; evita grupos historicamente negativos y respeta riesgo vivo |
| Correlation Filter | Mantener; grupo rechazado tuvo -0.296R de expectancy, sin significancia causal |
| Position Sizer | Mantener provisionalmente; mas PnL y mucho mas DD sobre cinco trades |
| Risk Manager | Mantener como safety; rendimiento contrafactual no identificable con el logging actual |

## Datos necesarios para una respuesta estadistica definitiva

1. Persistir candidatos aun cuando Risk Manager o Portfolio Capacity bloqueen el ciclo, en modo read-only/shadow.
2. Guardar `policy_version`, contribuciones con y sin modulo y decision shadow por candidato.
3. Persistir snapshots de balance, margen, riesgo vivo y beneficio protegido por ciclo.
4. Registrar el motivo exacto entre `selected` y `OPEN_POSITION`.
5. Acumular al menos 30-50 ciclos independientes por version y ejecutar walk-forward.
6. Evaluar trailing real por separado del entry policy.

## Artefactos reproducibles

- Script: `scripts/quantitative_ablation_audit.js`
- Resumen CSV: `docs/architecture/quantitative-ablation-summary.csv`
- Cache temporal de klines: `/tmp/aterum-quant-cache`
- Resultado completo temporal: `/tmp/quant-ablation-results.json`
