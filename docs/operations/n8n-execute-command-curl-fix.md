# n8n Execute Command curl Fix

Fecha: 2026-06-23

## Problema

El nodo historico `Execute Command` fallo con:

```text
/bin/sh: curl: not found
```

Comando afectado:

```bash
curl -m 30 "http://localhost:3000/chart?symbol=SPCXUSDT" -o /tmp/chart.jpg
```

## Causa

La imagen `aterum-n8n-compat:local` esta basada en Docker Hardened Image Alpine y no incluye `curl` ni gestor `apk` disponible dentro del contenedor runtime.

Ademas, `wget` no era sustituto suficiente porque resolvia `localhost` a IPv6 (`::1`) y el Chart API escucha por IPv4 en el namespace compartido.

## Correccion

Se agrego un shim compatible llamado `curl`:

```text
/usr/local/bin/curl
```

Archivo fuente:

```text
/home/n8n-compat/curl-shim.js
```

Dockerfile actualizado:

```text
/home/n8n-compat/Dockerfile
```

El shim soporta el patron usado por los workflows historicos:

```bash
curl -m 30 URL -o archivo
```

Tambien normaliza:

```text
http://localhost
```

a:

```text
http://127.0.0.1
```

para evitar el fallo IPv6.

## Validacion

Comando probado dentro de `home-n8n-1`:

```bash
curl -m 30 "http://localhost:3000/chart?symbol=SPCXUSDT" -o /tmp/chart.jpg
```

Resultado:

```text
exit=0
/tmp/chart.jpg generado
JPEG valido
```

## Persistencia

Imagen actualizada:

```text
aterum-n8n-compat:local
```

Image ID:

```text
6a3f96b3d733
```

No se modifico ningun workflow ni logica de trading.
