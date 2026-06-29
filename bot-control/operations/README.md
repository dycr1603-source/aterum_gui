# Operacion y recuperacion

## Verificacion diaria

```bash
docker compose ps
docker stats --no-stream
curl -f http://127.0.0.1/healthz
curl -f http://127.0.0.1/n8n/
```

Comprobar en GUI:

- timestamp de datos live;
- balance, equity y PnL coherentes;
- posiciones con entry, SL y TP;
- ultima ejecucion de Main Bot, SL Monitor y Trailing Manager;
- ausencia de ejecuciones colgadas o errores repetitivos.

## Backup minimo

1. Dump consistente de MariaDB.
2. Backup del volumen n8n con n8n detenido o mediante snapshot consistente.
3. Copia del `.env` en un gestor de secretos, nunca en Git.
4. Exportacion n8n raw cifrada fuera del repositorio.
5. Snapshot sanitizado en `bot-control/workflows/current/`.

## Recuperacion

1. Levantar MariaDB y Redis.
2. Restaurar esquema/dump y volumen n8n.
3. Levantar Dashboard y Chart API.
4. Levantar n8n con `N8N_TRADING_DISABLED=1`.
5. Validar credenciales, webhooks, SL Monitor y Trailing Manager.
6. Levantar nginx.
7. Habilitar trading solo tras comparar Binance, MySQL, API y GUI.

Referencias detalladas:

- [`../../docs/deployment/deployment.md`](../../docs/deployment/deployment.md)
- [`../../docs/operations/n8n-recovery-report.md`](../../docs/operations/n8n-recovery-report.md)
- [`../../docs/reports/disk-cleanup-report.md`](../../docs/reports/disk-cleanup-report.md)
- [`../../docs/operations/dashboard-data-consistency.md`](../../docs/operations/dashboard-data-consistency.md)
