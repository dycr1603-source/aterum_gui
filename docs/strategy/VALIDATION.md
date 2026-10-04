# Validación de la implementación

Comprobaciones de código sin órdenes de prueba. El despliegue posterior en Delcon está documentado en [DEPLOYED.md](DEPLOYED.md):

| Comprobación | Resultado |
|---|---|
| Baseline previo de tests offline | 46/46 archivos |
| Regresión completa `npm run test:offline` | 49/49 archivos |
| `npm run test:strategy` | 28/28 pruebas |
| Estrategia y JEV en Node 22 de la imagen Docker, sin red y con código en sólo lectura | 71/71 pruebas |
| `npm run build` | Correcto; sintaxis de backend y 29 scripts del GUI en ocho páginas |
| GUI con Puppeteer, escritorio y móvil de 390 px | Sin errores JavaScript ni desbordamiento horizontal; selector de fuentes verificado |
| `git diff --check` | Sin errores |

La suite completa dentro de la imagen de producción pasó 46/48 archivos. Los dos fallos fueron `host_control_git.test.js` y `telegram_history_sync.test.js`: esa imagen no contiene el ejecutable `git` (`spawnSync git ENOENT`). Ambos pasan en el host. No se alteró la imagen para ocultar esta diferencia de entorno.

Las pruebas nuevas cubren indicadores y señales, estructura de stops/targets, costes y PnL, riesgo separado del leverage, límites 1–10x, circuit breaker, LONG/SHORT/NO_TRADE, parsing y disponibilidad de JEV, rechazo Binance, datos inválidos, recibos de ejecución y atribución de fills. Son pruebas aisladas; no sustituyen validación operativa con ejecuciones reales.

Capturas del GUI: [escritorio](dashboard-preview.png) y [móvil](dashboard-mobile.png). Se usa el informe real con transporte simulado; no es una captura del servicio desplegado. Los logs locales están en `.local/strategy-v2/`.

Se ejecutó el despliegue y se verificaron los cuatro workflows publicados. El rollback se revisó pero no se ejecutó. La política activa usa `enforce` con autorización manual vinculada al informe; las pruebas comprueban que esa autorización no cambia el resultado negativo de validación.

Pendientes que impiden aprobar una estrategia: expectancy robusta positiva, evaluación fuera de muestra de JEV y ejecución, comparación integral OLD/NEW, cinco cierres históricos sin entrada atribuible y cobertura completa de MAE/MFE. La investigación actual no cumple los criterios de promoción.
