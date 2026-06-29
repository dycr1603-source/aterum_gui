# Comparacion workflows vs codigo

Los workflows de `/tmp` tienen prioridad como fuente de verdad. Esta tabla cruza lo que esperan contra lo encontrado o reconstruido.

| Contrato esperado por workflows | Estado en repositorios | Estado final |
| --- | --- | --- |
| `GET /db/stats` | Existe en `aterum_gui/routes/analytics.js` | Validado con respuesta JSON. |
| `POST /db/trade/open` | Existe en `aterum_gui/routes/analytics.js` | Compatible. |
| `POST /db/trade/close` | Existe en `aterum_gui/routes/analytics.js` | Compatible. |
| `POST /db/trade/update-sl` | Existe en `aterum_gui/routes/analytics.js` | Compatible. |
| `POST /db/rejection` | Existe en `aterum_gui/routes/analytics.js` | Compatible. |
| `POST /db/scan` | Existe en `aterum_gui/routes/analytics.js` | Compatible. |
| `POST /db/post-trade` | Existe en `aterum_gui/routes/aidata.js` | Compatible. |
| `GET /cb/status` | Existe en `aterum_gui/routes/cb.js` | Validado con respuesta JSON. |
| `POST /cb/sl` | Existe en `aterum_gui/routes/cb.js` | Compatible. |
| `POST /cb/tp` | Existe en `aterum_gui/routes/cb.js` | Compatible. |
| `POST /cooldown/set` | Existe en `aterum_gui/routes/cooldown.js` | Compatible. |
| `GET /cooldown/status` | Existe en `aterum_gui/routes/cooldown.js` | Validado con respuesta JSON. |
| `POST /trade` | Existe en `aterum_gui/routes/trades.js` | Compatible. |
| `DELETE /trade/:symbol` | Existe en `aterum_gui/routes/trades.js` | Compatible. |
| `GET /trades` | Existe en `aterum_gui/routes/trades.js` | Compatible. |
| `POST /sync` | Existe en `aterum_gui/routes/trades.js` | Compatible. |
| `GET /intelligence/signal` | Existe en `aterum_gui/routes/intelligence.js` | Compatible. |
| `GET /api/simulator/report` | Existe en `aterum_gui/routes/simulator.js` | Compatible. |
| `GET /api/simulator/policy` | No existia | Reconstruido sin cambiar contratos de trading. Validado. |
| `GET /chart` en `localhost:3000` | Existe en `aterum_gui/server.js` | Validado `GET /healthz`; `/chart` requiere parametros de simbolo. |
| `GET /webhook/sl-monitor-get` | No pertenece al repo; lo provee workflow `SL Monitor` | Disponible al importar/activar workflow en n8n. |
| `POST /webhook/sl-monitor-set` | No pertenece al repo; lo provee workflow `SL Monitor` | Disponible al importar/activar workflow en n8n. |
| `POST /webhook/sl-monitor-reset` | No pertenece al repo; lo provee workflow `SL Monitor` | Disponible al importar/activar workflow en n8n. |
| `Operations Executor` | Export no encontrado en `/tmp`; no existe servicio/repo dedicado | Componente historico ausente. Documentado como faltante. |

## Gaps detectados y resueltos

### `/api/simulator/policy`

El workflow principal llama:

```text
GET /api/simulator/policy?limit=160&hours=8&key=aterum_policy_v1
```

El repo solo tenia `/api/simulator/report`. Se reconstruyo `getSimulatorPolicy()` en `services/simulator.js` y se expuso en `routes/simulator.js`. Devuelve:

- `key`
- `generatedAt`
- `reportGeneratedAt`
- `options`
- `guardrails`
- `opportunityGroups`

La respuesta fue validada localmente con `curl`.

### Dependencia hardcodeada de n8n para `flatted`

`services/simulator.js` dependia de:

```text
/usr/lib/node_modules/n8n/node_modules/flatted
```

En Docker eso no era portable. Se agrego `flatted` a `package.json` y se dejo fallback al path historico. No cambia comportamiento funcional.

### Infraestructura Docker ausente

Ningun repo contenia Compose completo. Se reconstruyo:

- `mysql`
- `redis`
- `dashboard`
- `aterum_gui`
- `n8n`
- `nginx`

### Schema SQL ausente

No habia dump ni migraciones. Se infirio desde:

- rutas SQL del backend
- referencias del repo `n8nTradeSkill`
- workflows exportados
- endpoints esperados por dashboard y n8n

## Gaps que siguen siendo historicos/no versionados

- Export de `Operations Executor`.
- Credenciales n8n reales.
- Cualquier workflow o credencial no exportado en `/tmp`.
- Historico de datos de produccion.
- Configuracion exacta de PM2/systemd original si existio fuera de GitHub.
