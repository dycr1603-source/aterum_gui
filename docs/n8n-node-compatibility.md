# n8n Node Compatibility

Fecha: 2026-06-21

## Resultado

Los workflows históricos cargan, están publicados y quedaron activos en n8n.

Workflows validados:

| Workflow | ID | Estado |
| --- | --- | --- |
| Advanced AI Trading Bot v2 - Clean | `Cz4TfvaVAygWGRJm` | `active=true` |
| SL Monitor | `ZYhtV8yWXjNukrW4` | `active=true` |
| Trailing Manager | `q32UEjoj5wNiBHil` | `active=true` |

## Version final de n8n

```text
2.26.8
```

Imagen:

```text
n8nio/n8n:latest
```

## Problema detectado

Error original:

```text
Unrecognized node type: n8n-nodes-base.executeCommand
```

La imagen instalada no era reducida ni incompatible: los archivos del nodo `Execute Command` existían dentro del contenedor.

La causa fue que n8n 2.26.x excluye por defecto los nodos:

- `n8n-nodes-base.executeCommand`
- `n8n-nodes-base.localFileTrigger`

El catálogo activo de n8n inicialmente exportaba 895 tipos de nodo y no incluía `n8n-nodes-base.executeCommand`.

## Correccion aplicada

Archivos modificados:

- `/home/docker-compose.yml`
- `/home/.env`
- `/home/.env.example`

Variable agregada:

```env
NODES_EXCLUDE=[]
```

Servicio recreado:

```bash
docker compose -f /home/docker-compose.yml up -d --force-recreate n8n
```

Despues del cambio, el catalogo activo exporta 898 tipos de nodo e incluye:

- `n8n-nodes-base.executeCommand`
- `n8n-nodes-base.executeCommandTool`

## Inventario de nodos

Fuente completa:

- `/workflows-node-inventory.md`

Resumen consolidado:

| Tipo de nodo | Cantidad | Estado |
| --- | ---: | --- |
| `n8n-nodes-base.code` | 28 | Disponible |
| `n8n-nodes-base.executeCommand` | 3 | Disponible |
| `n8n-nodes-base.if` | 7 | Disponible |
| `n8n-nodes-base.scheduleTrigger` | 5 | Disponible |
| `n8n-nodes-base.ssh` | 1 | Disponible |
| `n8n-nodes-base.stickyNote` | 1 | Disponible |
| `n8n-nodes-base.telegram` | 12 | Disponible |
| `n8n-nodes-base.webhook` | 3 | Disponible |

Nodos faltantes despues de la correccion:

```text
ninguno
```

## Publicacion y activacion

Comandos ejecutados:

```bash
n8n publish:workflow --id=Cz4TfvaVAygWGRJm
n8n publish:workflow --id=ZYhtV8yWXjNukrW4
n8n publish:workflow --id=q32UEjoj5wNiBHil

n8n update:workflow --id=Cz4TfvaVAygWGRJm --active=true
n8n update:workflow --id=ZYhtV8yWXjNukrW4 --active=true
n8n update:workflow --id=q32UEjoj5wNiBHil --active=true
```

Nota: `update:workflow` esta marcado como deprecated por n8n, pero funciono correctamente para dejar `active=true`.

Despues de publicar y activar se recreo n8n para que cargue triggers y webhooks.

## Validacion

Catalogo de nodos:

```text
Found 898 node types
n8n-nodes-base.executeCommand disponible
```

Estado exportado de workflows:

```text
ZYhtV8yWXjNukrW4 | SL Monitor | active=true | nodes=12
q32UEjoj5wNiBHil | Trailing Manager | active=true | nodes=4
Cz4TfvaVAygWGRJm | Advanced AI Trading Bot v2 - Clean | active=true | nodes=44
```

Logs de arranque:

```text
Activated workflow "SL Monitor" (ID: ZYhtV8yWXjNukrW4)
Activated workflow "Trailing Manager" (ID: q32UEjoj5wNiBHil)
Activated workflow "Advanced AI Trading Bot v2 - Clean" (ID: Cz4TfvaVAygWGRJm)
```

Validacion REST autenticada:

```text
Cz4TfvaVAygWGRJm | Advanced AI Trading Bot v2 - Clean | active=True | nodes=44 | empty_types=0
ZYhtV8yWXjNukrW4 | SL Monitor | active=True | nodes=12 | empty_types=0
q32UEjoj5wNiBHil | Trailing Manager | active=True | nodes=4 | empty_types=0
```

Acceso publico:

```text
http://15.229.49.86/n8n/ -> HTTP 200 OK
```

Errores de nodo desconocido en logs despues del reinicio:

```text
ninguno
```

## Observacion operativa

`Execute Command` queda habilitado porque los workflows historicos lo requieren. Esto restaura compatibilidad con el sistema original, pero el nodo permite ejecutar comandos dentro del entorno de n8n y debe mantenerse protegido mediante acceso administrativo restringido.
