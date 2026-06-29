# Acceso publico

> Estado vigente desde 2026-06-28: la URL canonica es `https://aterum.duckdns.org`. Las referencias por IP que aparecen mas abajo son evidencia historica y no deben usarse como instrucciones operativas. La configuracion actual esta documentada en [`../../bot-control/infra/`](../../bot-control/infra/README.md).

Fecha: 2026-06-21.

## IP y entorno

IP publica detectada:

```text
15.229.49.86
```

Metadata EC2:

```text
instance-id: i-008bf27957ddea133
region: sa-east-1
private-ip: 172.31.36.200
public-ipv4: 15.229.49.86
```

AWS CLI esta instalado, pero no hay credenciales IAM disponibles:

```text
Unable to locate credentials. You can configure credentials by running "aws configure".
```

Por eso no fue posible modificar Security Groups desde el servidor.

## Puertos publicados

`ss -tulpn` confirma listeners en todas las interfaces:

| Puerto | Listener | Uso |
| --- | --- | --- |
| `80` | docker-proxy `0.0.0.0:80` | nginx |
| `3000` | docker-proxy `0.0.0.0:3000` | chart API |
| `3001` | docker-proxy `0.0.0.0:3001` | dashboard/API |
| `5678` | docker-proxy `0.0.0.0:5678` | n8n |
| `22` | sshd | SSH |

## Firewall local

`ufw` no esta instalado.

`iptables`:

- INPUT policy: `ACCEPT`.
- Docker creo reglas NAT/FORWARD para `80`, `3000`, `3001`, `5678`.
- No hay bloqueo local para HTTP/n8n.

Conclusion: el bloqueo no esta en el host; esta antes de la instancia, probablemente AWS Security Group/NACL.

## nginx

Archivo:

```text
/home/nginx/nginx.conf
```

Rutas configuradas:

| Ruta publica | Destino interno |
| --- | --- |
| `/` | dashboard GUI `dashboard:3001` |
| `/api` y `/api/` | dashboard/API `dashboard:3001` |
| `/chart` | chart API `dashboard:3000` |
| `/n8n` y `/n8n/` | n8n `dashboard:5678` |
| `/rest/`, `/assets/`, `/static/`, `/favicon.ico` | n8n assets/API |
| `/webhook/`, `/webhook-test/` | n8n webhooks |
| `/ws` | dashboard websocket |

No se cambio `N8N_PATH` para no romper los webhooks historicos internos `/webhook/sl-monitor-*`.

Nota: la documentacion oficial de n8n recomienda configurar `WEBHOOK_URL` y `N8N_PROXY_HOPS` cuando hay reverse proxy. Tambien advierte que `N8N_PATH` con reverse proxies puede causar problemas de navegacion; por eso se mantiene n8n en raiz interna y se proxifican assets absolutos.

Compose queda preparado con:

- `N8N_PROXY_HOPS=1`
- `WEBHOOK_URL`
- `N8N_EDITOR_BASE_URL`

Cuando AWS permita entrada publica, ajustar `.env` a valores como:

```text
WEBHOOK_URL=http://15.229.49.86/
N8N_EDITOR_BASE_URL=http://15.229.49.86/n8n/
```

Fuente: https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/ y https://docs.n8n.io/hosting/configuration/environment-variables/deployment/

## Validacion local

Pruebas locales exitosas:

```bash
curl http://127.0.0.1/healthz
curl http://127.0.0.1/api/account
curl http://127.0.0.1/n8n/
curl http://127.0.0.1/assets/index-bBXjuLUV.js
curl http://127.0.0.1:5678/healthz
```

Resultados:

- `/` responde y redirige a `/dashboard`.
- `/api/account` responde JSON.
- `/n8n/` responde HTML n8n.
- assets n8n responden `200`.
- `/webhook/sl-monitor-get` llega a n8n y devuelve `404 webhook not registered` porque el workflow esta importado pero inactivo. Eso confirma ruteo correcto sin activar workflows.

## Validacion externa

Pruebas contra IP publica:

```bash
curl -m 10 http://15.229.49.86/
curl -m 10 http://15.229.49.86:5678/healthz
curl -m 10 http://15.229.49.86:3001/healthz
curl -m 10 http://15.229.49.86/n8n/
```

Resultado:

| URL | Resultado |
| --- | --- |
| `http://15.229.49.86/` | `302 /dashboard`, nginx/dashboard OK |
| `http://15.229.49.86/healthz` | `200`, nginx -> dashboard OK |
| `http://15.229.49.86/n8n/` | `200`, nginx -> n8n OK |
| `http://15.229.49.86:3001/` | `302 /dashboard` |
| `http://15.229.49.86:3001/healthz` | `200`, dashboard OK |
| `http://15.229.49.86:3000/healthz` | `200`, chart API OK |
| `http://15.229.49.86:5678/` | `200`, n8n UI OK |
| `http://15.229.49.86:5678/healthz` | `200`, n8n OK |

Pruebas mediante servicios externos de fetch:

- `https://api.allorigins.win/raw?url=http://15.229.49.86/healthz` -> `200`, `{"ok":true,"service":"aterum-dashboard"}`.
- `r.jina.ai` contra `http://15.229.49.86/healthz` -> `200`, `{"ok":true,"service":"aterum-dashboard"}`.
- `r.jina.ai` contra `http://15.229.49.86/n8n/` -> `200`, title `n8n.io - Workflow Automation`.
- `r.jina.ai` contra `http://15.229.49.86:5678/healthz` -> `200`, `{"status":"ok"}`.

Conclusion: el acceso externo por `80`, `3000`, `3001` y `5678` funciona.

## Accion AWS

El puerto `80` ya responde externamente al final de la validacion. Si se endurece seguridad despues, mantener al menos inbound `80` para nginx y restringir `3000`, `3001`, `5678` a IPs administradoras si no se quieren publicar directamente.

Reglas minimas:

| Tipo | Protocolo | Puerto | Origen |
| --- | --- | --- | --- |
| HTTP | TCP | `80` | `0.0.0.0/0` |
| n8n directo, opcional | TCP | `5678` | IPs administradoras o `0.0.0.0/0` temporalmente |

Recomendado:

- Exponer publicamente solo `80`.
- Acceder a n8n por `http://15.229.49.86/n8n/`.
- Mantener `5678` restringido a IP administradora si se abre.
- No exponer `3000` y `3001` publicamente salvo necesidad puntual; nginx ya enruta `/api` y `/chart`.

Comando AWS CLI esperado, ejecutado desde una maquina con credenciales autorizadas:

```bash
aws ec2 authorize-security-group-ingress \
  --region sa-east-1 \
  --group-id SG_ID \
  --ip-permissions '[
    {"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"Aterum nginx HTTP"}]},
    {"IpProtocol":"tcp","FromPort":5678,"ToPort":5678,"IpRanges":[{"CidrIp":"YOUR_ADMIN_IP/32","Description":"n8n direct admin"}]}
  ]'
```

Para obtener `SG_ID`, desde una sesion AWS con permisos:

```bash
aws ec2 describe-instances \
  --region sa-east-1 \
  --instance-ids i-008bf27957ddea133 \
  --query 'Reservations[0].Instances[0].SecurityGroups'
```

## Estado final

Localmente listo:

- GUI/dashboard: OK.
- API `/api`: OK.
- n8n `/n8n/`: OK local.
- webhooks `/webhook/*`: enrutan a n8n.
- n8n directo `:5678`: OK local.

Pendiente recomendado:

- Revisar Security Group/NACL AWS y dejar publicos solo los puertos necesarios.
- Ideal: publico `80`; restringidos `3000`, `3001`, `5678`.

Acceso publico disponible mientras tanto:

- nginx/GUI: `http://15.229.49.86`
- GUI/dashboard: `http://15.229.49.86:3001`
- chart API: `http://15.229.49.86:3000`
- n8n: `http://15.229.49.86:5678`
