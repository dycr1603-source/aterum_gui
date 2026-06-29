# Bot Control Changelog

## 2026-06-27

- Creado el centro de control del bot.
- Incorporada la arquitectura completa del stack.
- Incorporado Docker Compose de referencia con secretos obligatorios por entorno.
- Incorporados nginx, esquema SQL e imagen n8n compatible.
- Generados snapshots sanitizados de los workflows actuales.
- Catalogada la documentacion tecnica existente.
- Incorporada la auditoria cuantitativa de rechazos.
- Incorporado el ledger de Learning Changes, revision estadistica antes/despues, versionado y rollback protegido.
- Incorporadas las vistas Learning Changes, Impacto Real y Learning Timeline en Research.

## 2026-06-28

- Migrada la entrada publica a `https://aterum.duckdns.org` con Let's Encrypt.
- Parametrizados nginx, URLs publicas y n8n mediante `APP_DOMAIN` y variables derivadas.
- Activados redirect HTTPS, HSTS y headers de seguridad.
- Restringidos Dashboard, Chart API y n8n a puertos loopback.
- Incorporados runbooks de red, SSL, proxy, Docker y migracion futura de dominio.
- Incorporado `telegram-control` como centro de monitoreo remoto read-only con InlineKeyboard.
- Reutilizadas las APIs de Dashboard, Research, Learning, Analytics e Intelligence sin duplicar endpoints.
- Incorporada auditoria persistente `telegram_audit` y whitelist de administradores Telegram.
- Evolucionado Telegram Control a multiusuario con roles viewer/moderator/admin y `telegram_users`.
- Incorporados `/why`, Evidencia, `/history`, `/changes`, `/simulate`, `/scan` y `/rebuild-report`.
- Ampliada auditoria con rol, grupo, endpoints utilizados y errores.

## 2026-06-29

- Evolucionado Telegram Control a Copiloto IA conversacional local-first.
- Añadidos enrutamiento determinista, conocimiento local, contexto mínimo para Claude y caché configurable.
- Incorporadas métricas persistentes de rutas, latencia, tokens utilizados y ahorro estimado mediante `/ai`.
- Añadidos `/guide`, `/tutorial`, `/menu`, `/new`, preguntas libres y botones contextuales.
- Reorganizada la documentación técnica por dominios con índices y enlaces canónicos.
- Corregido el incidente de SL lógico con STOP_MARKET nativo en Binance.
- Incorporado Position Guard independiente con reconciliación, auditoría y alertas críticas.
- Añadida lectura de órdenes algo al estado live del Dashboard.
- Auditada la separación de órdenes: ambas ramas Execute Trade crean la protección inicial y Position Guard deja de crear, reemplazar o cancelar SL/TP.
- Corregido Chart API tras recreación del namespace compartido y añadidos healthchecks cruzados para `3000`.
- Incorporado Decision Knowledge Graph read-only con Explorer, Timeline, Graph, Diff, Rule Impact, Evidence y Change History.
- Telegram `/trade`, `/timeline`, `/why`, `/evidence` y `/changes` reutilizan Knowledge API sin IA generativa.
