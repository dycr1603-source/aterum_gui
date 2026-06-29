# Claude Code Command SSH Fix

Fecha: 2026-06-23 UTC

## Problema

El nodo `Claude Code Command` fallaba con:

```text
connect ECONNREFUSED 127.0.0.1:22
```

## Causa

El nodo era de tipo:

```text
n8n-nodes-base.ssh
```

Dentro del contenedor n8n, `127.0.0.1:22` apunta al propio namespace del contenedor, no al SSH del host. Por eso el nodo intentaba abrir una conexión SSH inexistente.

Además, el comando sólo necesitaba ejecutar `curl` contra Anthropic leyendo `/tmp/chart.jpg`, archivo generado por el nodo anterior dentro del propio contenedor n8n.

## Cambio aplicado

Workflow:

```text
Advanced AI Trading Bot v2 - Clean
```

Nodo modificado:

```text
Claude Code Command
```

Cambio:

```text
n8n-nodes-base.ssh
→ n8n-nodes-base.executeCommand
```

Se mantuvo el mismo comando `curl`.

Se eliminaron las credenciales SSH del nodo porque ya no son necesarias.

## Validación

Versión publicada exportada:

```text
Claude Code Command n8n-nodes-base.executeCommand
credentials=false
parameters=command
```

n8n reiniciado y workflows activos:

- SL Monitor
- Trailing Manager
- Advanced AI Trading Bot v2 - Clean
- Recommendation Review Engine

Webhook validado:

```text
GET /webhook/sl-monitor-get
OK
```

No se ejecutaron órdenes reales.
