# Componentes faltantes o no versionados

Este documento separa lo reconstruido de lo que no aparece en GitHub ni en `/tmp`.

## Faltantes confirmados

| Componente | Evidencia | Impacto | Estado final |
| --- | --- | --- | --- |
| `Operations Executor` export JSON | El usuario lo menciona, pero `find /tmp -name "*.json"` solo encontro 3 workflows. | No puede importarse ni validarse contractualmente. | Documentado como faltante. El resto del stack queda listo para importarlo cuando aparezca. |
| Docker Compose original | Ninguno de los repos contiene compose completo. | No habia arranque reproducible desde cero. | Reconstruido en `/home/docker-compose.yml`. |
| Dockerfile original de `aterum_gui` | No existia. | No habia imagen reproducible. | Reconstruido en `/home/aterum_gui/Dockerfile`. |
| nginx original | No existia config nginx en repos. | No habia proxy unificado. | Reconstruido en `/home/nginx/nginx.conf`. |
| Dump/migraciones SQL | No hay `*.sql` ni migraciones originales. | MySQL no podia arrancar con esquema conocido. | Reconstruido en `/home/database/schema.sql`. |
| Credenciales n8n | Los exports referencian credenciales por ID/nombre, pero no incluyen secretos gestionables. | Workflows importados requieren recrear credenciales. | Documentado en `docs/operations/n8n.md`. |
| Historico de datos | No hay dump productivo. | Dashboard arranca vacio. | Schema inicial listo; restaurar backup si existe. |
| Configuracion exacta PM2/systemd productiva | Solo hay `ecosystem.config.cjs`; no hay unidad systemd ni deploy scripts. | No afecta Docker final. | Docker Compose reemplaza esa capa. |

## Endpoints faltantes detectados

### `/api/simulator/policy`

El workflow principal lo llama y no existia en el repo. Fue reconstruido en:

- `/home/aterum_gui/services/simulator.js`
- `/home/aterum_gui/routes/simulator.js`

Validacion:

```text
GET http://127.0.0.1:3001/api/simulator/policy?limit=10&hours=1&key=aterum_policy_v1
```

devuelve `key`, `generatedAt`, `options`, `guardrails` y `opportunityGroups`.

## APIs que no faltaban

Los endpoints criticos pedidos si existen o fueron reconstruidos:

- `/db/stats`
- `/db/trade/close`
- `/db/trade/update-sl`
- `/cb/status`
- `/cooldown/set`
- `/trade`
- `/trade/:symbol`
- `/db/trade/open`
- `/db/rejection`
- `/db/scan`
- `/db/post-trade`

## Tablas inferidas/reconstruidas

No habia dump, asi que se infirieron desde SQL del backend, workflows y referencias historicas:

- `users`
- `trades`
- `trade_closes`
- `trade_rejections`
- `scan_events`
- `circuit_breaker`
- `post_trade_analysis`
- vista `daily_pnl`
- vista `symbol_performance`

## Procesos esperados por workflows

| Proceso | Donde vive | Estado |
| --- | --- | --- |
| Bot principal de scanning/scoring | n8n workflow `Advanced AI Trading Bot v2 - Clean` | Export presente. |
| SL Monitor | n8n workflow `SL Monitor` | Export presente. |
| Trailing Manager | n8n workflow `Trailing Manager` | Export presente. |
| Operations Executor | n8n workflow/export externo | No encontrado. |
| Dashboard API | `aterum_gui/trade.js` | Reconstruido en Docker. |
| Chart API | `aterum_gui/server.js` | Reconstruido en Docker. |
| MySQL | servicio Docker | Reconstruido. |
| Redis | servicio Docker | Reconstruido. |
| nginx | config nueva | Reconstruido. |

## Riesgos residuales

- Sin `Operations Executor` no se puede garantizar compatibilidad de ese flujo especifico.
- Los workflows importados deben configurarse con credenciales nuevas; los IDs historicos pueden no existir en una instancia limpia.
- Los workflows contienen o contenian claves hardcodeadas. Deben rotarse.
- La validacion hecha evita ordenes reales de Binance; la validacion operativa completa debe hacerse con testnet o con trading deshabilitado antes de activar ejecuciones reales.
