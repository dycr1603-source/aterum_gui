# Disk Cleanup Report

Fecha: 2026-06-24 UTC

## Antes

- Root: 7.7 GB total, 7.5 GB usados, 102 MB libres, 99%.
- Inodes root: 60% usados.
- Docker: 5 imágenes activas, 2.997 GB.
- Volúmenes Docker: ~600 MB antes de compactar n8n.
- n8n SQLite: ~403 MB.
- VS Code Server/Codex temporales: >1 GB combinados antes de limpieza inicial.

## Eliminado

- Cachés y papelera de VS Code Server:
  - `CachedExtensionVSIXs`
  - logs de VS Code Server
  - runtime CLI de VS Code Server no perteneciente al stack
- Temporales de Codex:
  - caches
  - logs locales grandes
  - directorios temporales
- Cachés apt.
- Archivos temporales de imagen en `/tmp` (`jpg/png/tmp/chart.*`), conservando JSON de workflows.
- Docker prune seguro:
  - `docker container prune`
  - `docker network prune`
  - `docker builder prune -a`
  - `docker image prune -a`
- Historial de ejecuciones n8n:
  - se conservaron las últimas 1.000 exitosas
  - se conservaron los últimos 200 errores
  - se conservaron ejecuciones en curso
  - se compactó SQLite con `VACUUM`

## Conservado

- Repositorios clonados.
- `/home/docs`.
- JSON de workflows en `/tmp`.
- Volúmenes de MySQL.
- Volúmenes de n8n.
- Configuración nginx.
- Workflows y credenciales de n8n.
- Datos de trading en MySQL.

## Después

- Root: 7.7 GB total, 6.6 GB usados, 1.1 GB libres, 87%.
- Inodes root: 58% usados.
- Docker volumes: 211.9 MB.
- n8n SQLite: ~41 MB.
- No quedan contenedores Docker detenidos o creados.

## Nota

No se eliminaron imágenes activas porque los servicios dependen de ellas. El espacio libre máximo en este root queda limitado por las imágenes activas Docker (~3 GB) y el tamaño total del disco (7.7 GB).
