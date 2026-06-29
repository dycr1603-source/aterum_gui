# Research error fix

Fecha: 2026-06-23 UTC

## Errores detectados

- `/research` no estaba listado como pagina protegida en `requireAuth`.
  - En navegador sin sesion devolvia JSON `401 No autorizado`.
  - Ahora redirige correctamente a `/login`.
- `favicon.ico` generaba errores `401/404` en navegador.
  - Ahora responde `204` sin auth.
- Chromium mostraba warning por `apple-mobile-web-app-capable`.
  - Se reemplazo por `mobile-web-app-capable`.
- La extraccion de AI Research mezclaba hallazgos con recomendaciones:
  - `LO QUE FUNCIONO` se estaba tratando como oportunidad accionable.
  - Algunos riesgos se reclasificaban como oportunidad por palabras como `ganar` o `rentable`.

## Cambios aplicados

- `/home/aterum_gui/middleware/auth.js`
  - Se agrego `/research` a la lista de paginas protegidas.
- `/home/aterum_gui/trade.js`
  - Se agrego ruta `/favicon.ico` con respuesta `204`.
- `/home/aterum_gui/views/ui_shared.js`
  - Se agrego favicon inline.
  - Se agrego `mobile-web-app-capable`.
  - Se retiro meta legacy de Apple en paginas compartidas.
- `/home/aterum_gui/views/dashboard.js`
  - Se reemplazo meta legacy por `mobile-web-app-capable`.
- `/home/aterum_gui/routes/analytics.js`
  - `RECOMENDACIONES` alimenta recomendaciones.
  - `RIESGOS` y `PROBLEMAS` alimentan riesgos.
  - `OPORTUNIDADES` alimenta oportunidades.
  - `LO QUE FUNCIONO` queda como hallazgo, no como recomendacion accionable.
  - Riesgos y oportunidades conservan su categoria original.

## Datos regenerados

- Se eliminaron recomendaciones pendientes generadas por el parser anterior.
- Se resincronizaron recomendaciones desde `research_reports`.
- Resultado final:
  - `research_reports`: 2 informes visibles
  - `ai_recommendations`: 23 recomendaciones/riesgos/oportunidades
  - categorias:
    - risk: 15
    - opportunity: 5
    - recommendation: 2
    - time: 1

## Validacion

- Carga autenticada de `/research`:
  - eventos de consola: `[]`
  - errores JS: ninguno
  - requests 4xx/5xx: ninguno durante la pagina
  - informes visibles: 2
  - recomendaciones visibles: 23
  - riesgos visibles: 10
  - oportunidades visibles: 5
- Acceso anonimo:
  - `/research`: `302` a `/login`
  - `/favicon.ico`: `204`
- Servicios:
  - dashboard: healthy
  - aterum_gui/chart API: healthy
  - mysql: healthy
  - redis: healthy
  - n8n: up
  - nginx: up

## Persistencia

- Se actualizo la imagen local:
  - `aterum-dashboard:local`
  - image id: `ad1ca7d4848e`
