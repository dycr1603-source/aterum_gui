# GUI: implementación y verificación

Fecha: 2026-09-26. Cambios reconstruidos y desplegados en los contenedores `dashboard`, `aterum_gui`, `n8n` y `nginx`; servicios comprobados saludables. Imagen anterior preservada en `aterum-dashboard:pre-gui-20260926`. Los límites efectivos del portfolio del Dashboard se conservaron durante el despliegue.

## Datos recuperados y correcciones

| Vista | Datos o problema | Implementación |
| --- | --- | --- |
| Inteligencia | Oportunidades y ciclos disponibles en `/api/opportunities/latest`, sin consumidor visual | Ranking, universo/elegibles/evaluados, selección, puntuación técnica/final, umbral, aporte de aprendizaje, factores y bloqueos desplegables |
| Inteligencia | Cobertura disponible en `/api/opportunities/coverage` | Universo observado, analizados, frescos en 3 horas, fecha de último análisis y tabla de símbolos pendientes |
| Inteligencia | Contexto IA recibido pero ausente de la tabla | Desplegable con razonamiento, riesgo principal, razón de visión, tendencia/RSI 4H, cambio BTC, riesgo efectivo, multiplicadores, fallback y símbolo original |
| Research → Motor y reglas | `/api/research/shadow-summary` no se mostraba | Conteos, diferencias de decisiones, aporte promedio y comparación producción/shadow por símbolo y fecha |
| Decisiones | `/api/trade/:id/decision-trace` no se mostraba | Factores de puntuación, riesgo solicitado/real, cantidad, margen requerido, capacidad al abrir, política y ciclo |
| Decisiones | Campos del detalle omitidos | Entrada/salida, cantidad, apalancamiento, funding y motivo de cierre; enlaces desde Analytics e Inteligencia |
| Analytics | `trade_closes.exit_price` no estaba incluido en `/db/stats` | Se agregó a la consulta para alimentar la columna Salida |
| Analytics → Cuenta | Datos de posiciones reducidos a chips | Tabla con cantidad, entrada, marca, margen, apalancamiento, PnL, SL y TP |
| Analytics e Inteligencia | Pérdidas sin signo y PnL invertido según etiquetas SL/TP | Se muestra el valor persistido, sin reinterpretar su signo; el filtro de pérdidas excluye posiciones abiertas |
| Analytics | Período de resultado basado en apertura; muestra limitada no explícita | Fecha de cierre para resultados, indicación de últimas 50 operaciones y métricas históricas etiquetadas |
| Trading y Analytics | Cero confundido con ausencia; cuenta marcada en vivo por recepción, sin validar fecha | Ceros válidos visibles, estado de frescura, consumo del resumen diario y actualización de Analytics tras cargar estadísticas |
| Simulador | Política histórica no visible | Límites y grupos de `/api/simulator/policy`, según muestra/ventana seleccionadas |
| Simulador | Si no había señales se leía `services/sample-report.json`, incluyendo resultados “reales” inventados | Fallback eliminado. Las operaciones reales siempre se consultan en MySQL; ausencia de señales y fallo de fuente se distinguen |

Los ajustes de cuenta agregan `status` y `snapshotTs` sin retirar campos existentes. Una respuesta de error de Binance ya no se transforma en un balance cero; se conserva la última lectura válida y se marca desactualizada/no disponible. Los endpoints históricos responden con error si la consulta falla, en lugar de representar el fallo como una lista vacía.

## Presentación

Sistema compartido en `assets/gui.css` y `assets/gui.js`: colores y superficies consistentes, temas claro/oscuro, tipografía, jerarquía, espaciado, cifras tabulares, tablas con scroll interno, controles adaptables y estados de carga/vacío/error con reintento. Navegación en español, enlace para saltar al contenido, foco visible, menú móvil con foco contenido y cierre con Escape. El asistente móvil deja de tapar las pestañas. La ayuda del simulador es desplegable para dar prioridad a los datos.

Los indicadores derivados de Trading tienen etiquetas acordes a su cálculo: “Sesgo técnico” y “PnL de cierres visibles”. Se redujeron brillos y animaciones decorativas conservando las gráficas alimentadas por velas reales.

## Verificación

- `npm run build`: sintaxis de servidor y de 26 scripts dentro del HTML generado para las siete páginas; este proyecto no requiere empaquetador frontend.
- `npm run test:gui`: contratos de PnL, fechas/filtros, ceros/ausencias, frescura, errores HTTP, validación de snapshots y simulador sin datos de ejemplo.
- `npm run test:offline`: 30 de 31 archivos pasan. El fallo de `tests/jev.test.js:147` también se reprodujo en una copia temporal de HEAD sin modificar: la expectativa de elegibilidad no coincide con `services/jev_authority.js`. No se cambió la lógica de trading para hacerlo pasar.
- `npm run test:gui:live`: Chromium, sesión real del backend local, siete páginas a 1440×1000 y 390×844, temas, menú móvil, respuesta a HTTP 503, conservación de datos y recuperación. Sin errores de ejecución ni desbordamiento horizontal en esas vistas.
- Comparación automatizada con APIs reales: PnL filtrado de Analytics, cantidad/selección de oportunidades y conteo de evaluaciones shadow.
- El lector corregido del simulador se ejecutó por separado dentro del entorno del backend contra SQLite/MySQL reales: muestra de 10 ejecuciones sin señales compatibles; historial real de 13 cierres y PnL de 3,15 USDT en el momento de la consulta. El servicio anterior mostraba 145 cierres y 2.845,67 USDT procedentes del archivo de ejemplo.
- Inspección visual de capturas de Trading, Analytics, Research móvil, Decisiones móvil, oportunidades y Simulador. Artefactos locales en `/tmp/aterum-gui-review/`; no se incorporaron datos de cuenta ni capturas al repositorio.

## Reproducir y límites

```bash
npm run build
npm run test:gui
npm run test:offline
npm run preview:gui
# http://127.0.0.1:3101; requiere el backend en 127.0.0.1:3001 y su sesión habitual
npm run test:gui:live
```

La prueba visual utiliza `GUI_TEST_USER`/`GUI_TEST_PASSWORD` o las credenciales locales de administrador, sin imprimirlas. `GUI_ARTIFACTS` permite cambiar la carpeta de capturas. La vista previa conserva la autenticación del backend y solo permite lecturas y el POST de login; no habilita operaciones de trading.

El despliegue recreó Dashboard, Chart API, n8n y nginx juntos porque comparten red. Todos los contenedores quedaron saludables; login y APIs conservan la autenticación. El lector del simulador se verificó contra el histórico real, como se detalla arriba. No se modificaron workflows, sizing ni los cambios previos de Telegram.

La cuenta no aparecía por un desfase de aproximadamente 77 segundos entre el reloj del host y Binance, que rechazaba las consultas firmadas con `-1021`. El backend ahora sincroniza el reloj con Binance antes de leer cuenta/posiciones y vuelve a calibrarlo cada 30 segundos. Verificado en vivo: balance, equidad, disponible y cinco posiciones se muestran en Trading y Analytics y coinciden con `/api/account`. Las librerías de gráficos y fuentes externas siguen dependiendo de sus CDN. Analytics conserva el límite contractual de 50 operaciones; no pretende representar todo el historial al aplicar filtros sobre esa muestra.
