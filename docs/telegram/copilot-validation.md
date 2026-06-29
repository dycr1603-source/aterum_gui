# Validacion del Copiloto Telegram

Fecha: 2026-06-29 UTC

## Arquitectura aplicada

1. `commandFrom` reconoce comandos, botones, conversación privada, respuestas al bot y menciones en grupo.
2. `knowledge.commandIntent` convierte preguntas operativas conocidas en comandos existentes.
3. `knowledge.answer` resuelve definiciones frecuentes con contenido local.
4. `copilot.answer` consulta caché y sólo entonces construye contexto temático para Claude.
5. Toda ruta queda cuantificada en `telegram_ai_usage`; las respuestas Claude se guardan temporalmente en `telegram_ai_cache`.

No se creó ningún endpoint de negocio. Se reutilizaron Dashboard State, `/db/stats`, Research, Learning, Intelligence, Simulator y post-trade.

## Validacion realizada

| Prueba | Resultado |
| --- | --- |
| Sintaxis de todos los módulos | OK dentro de la imagen real |
| Unit tests de parser, RBAC, Markdown y routing | OK |
| Self-test de 26 comandos | OK |
| Intenciones deterministas | 9/9 locales |
| FAQs | 13/13 locales |
| Pregunta compleja clasificada fuera de FAQ | OK |
| Mensajes y botones Telegram reales | 5/5 enviados y eliminados tras validar |
| Enlaces Markdown | 88 archivos, 0 enlaces rotos |
| Salud Telegram Control | healthy |
| Salud n8n | healthy |

Con una consulta compleja por cada 22 consultas cubiertas, el routing observado proyecta 95.65% de respuestas sin Claude. Tras compactar contexto y salida, una consulta de validación consumió 1.617 tokens frente a 5.207 en la primera iteración; la repetición consumió cero tokens. El patrón validado proyecta aproximadamente 92.5% de reducción de tokens frente a consultar Claude para las 23 solicitudes.

## Credencial Anthropic

La variable global contenía un placeholder. Se localizó una clave histórica en un backup de workflow, se validó mediante la API de modelos con HTTP 200 y se migró a `TELEGRAM_ANTHROPIC_API_KEY` en `/home/.env`. La variable es exclusiva del sidecar: n8n no fue modificado. La clave no se imprimió ni se documentó.

El cache miss, cache hit y envío real a Telegram quedaron validados. Los mensajes de prueba se eliminaron y las filas sintéticas de `telegram_ai_usage`/`telegram_ai_cache` se limpiaron para iniciar las métricas operativas desde cero.

## Archivos funcionales

- `telegram-control/knowledge.js`: intenciones, FAQ y explicaciones contextuales.
- `telegram-control/copilot.js`: contexto mínimo, Claude y caché.
- `telegram-control/audit.js`: persistencia de métricas y caché.
- `telegram-control/commands.js`: `/ask`, `/ai`, ayuda, guía, tutorial y novedades.
- `telegram-control/telegram.js`: menús y botones contextuales.
- `telegram-control/index.js`: conversación y router.
- `/home/docker-compose.yml`, `.env.example`: runtime configurable.
- `/home/database/schema.sql`: tablas auxiliares idempotentes.

## Siguiente fase recomendada

Observar `/ai` durante una semana antes de ajustar TTL o límites. El objetivo operativo es mantener más de 90% de reducción de tokens; no hace falta modificar ningún componente de trading.
