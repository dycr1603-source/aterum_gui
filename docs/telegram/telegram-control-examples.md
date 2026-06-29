# Validación de respuestas Telegram

Prueba ejecutada el 2026-06-28 contra APIs y bases reales, sin ejecutar workflows ni Simulator.

| Comando | Resultado | Tamaño | Tiempo |
|---|---|---:|---:|
| `/status` | OK | 487 caracteres | 644 ms |
| `/balance` | OK | 241 caracteres | 41 ms |
| `/positions` | OK | 804 caracteres | 45 ms |
| `/performance` | OK | 239 caracteres | 55 ms |
| `/research` | OK | 2938 caracteres | 163 ms |
| `/learning` | OK | 306 caracteres | 40 ms |
| `/health` | OK | 441 caracteres | 272 ms |
| `/logs` | OK | 1474 caracteres | 18 ms |
| `/news` | OK | 1112 caracteres | 832 ms |
| `/ai` | OK | 581 caracteres | 10 ms |
| `/simulator` | OK, metadatos solamente | 283 caracteres | 7 ms |
| `/help` | OK | 384 caracteres | 1 ms |

## Ejemplo de estilo

```text
📊 ESTADO ATERUM

Balance: dato real de Binance
Disponible: dato real de Binance
PnL diario: valor y porcentaje
PnL semanal: valor y porcentaje
Drawdown: valor y porcentaje
Posiciones abiertas: cantidad real

Servicios
🟢 Binance
🟢 MySQL
🟢 Redis
🟢 Dashboard
🟢 n8n
🟢 Claude
🟢 Telegram
```

Se envió un `/status` real con MarkdownV2 e InlineKeyboard al supergrupo autorizado. La entrega fue aceptada por Telegram en un único mensaje y quedó registrada como `status:deployment-test` en `telegram_audit`.

## Validación multiusuario y operaciones inteligentes

| Comando | Rol probado | Resultado Telegram |
|---|---|---|
| `/why SYMBOL` | viewer | aceptado con botón Ver Evidencia |
| Evidencia | viewer | aceptada con Research, Review, Post Trade, Rule y Anthropic |
| `/history SYMBOL` | viewer | aceptado |
| `/changes` | viewer | aceptado |
| `/simulate` | moderator | aceptado, sin órdenes ni workflows |
| `/scan` | moderator | aceptado, sólo scans persistidos |
| `/rebuild-report` | moderator | aceptado, sin persistencia nueva |
| `/users` | admin | aceptado |

Los mensajes se enviaron con notificaciones desactivadas y se eliminaron después de que Telegram validó MarkdownV2 e InlineKeyboard.

La matriz negativa también fue probada:

- viewer no puede ejecutar `/simulate`.
- moderator no puede ejecutar `/users`.
- admin conserva acceso completo.
- autoalta crea rol viewer.
- promoción a moderator y deshabilitación persisten correctamente.
- registros temporales de prueba fueron eliminados al finalizar.

## Evidencia end-to-end del grupo

Después del despliegue, un miembro nuevo del supergrupo fue auto-registrado como `viewer` y ejecutó realmente:

| Comando | Resultado | Auditoría |
|---|---|---|
| `/status` | OK | 11 fuentes, sin error |
| `/start` | OK | rol viewer persistido |
| `/history` | OK | respuesta dirigida al usuario |
| `/balance` | OK | 2 endpoints, sin error |

Esto valida recepción por long polling, parsing del grupo, autoalta, RBAC, consulta de APIs, envío Telegram y persistencia de auditoría en una misma ejecución.
