# UI/UX Refactor

Fecha: 2026-06-22

## Objetivo

Reorganizar la plataforma para que se sienta mas estable, profesional e institucional, separando AI Research de `/ai-data` y reduciendo efectos visuales reactivos.

## Navegacion final

Menu superior actualizado:

- Trading
- Analytics
- Research
- News
- Simulator
- AI Assistant

## Nueva pagina

Ruta creada:

- `/research`

Archivos modificados:

- `/home/aterum_gui/trade.js`
- `/home/aterum_gui/views/research.js`
- `/home/aterum_gui/views/aidata.js`
- `/home/aterum_gui/views/ui_shared.js`
- `/home/aterum_gui/views/dashboard.js`

AI Research fue retirado de `/ai-data`. La pagina `/ai-data` queda enfocada en noticias, sesiones, inteligencia de mercado y asistente.

## Research independiente

La nueva pagina `/research` incluye:

- header con ultimo informe, fecha, modelo y estado
- overview integrado
- how it works
- recommendation performance
- ultimo informe Anthropic
- tabla completa de recomendaciones
- riesgos
- oportunidades
- operator actions
- strategy evolution
- explicabilidad visible dentro de la GUI

No se agregaron datos falsos ni placeholders hardcodeados. Todo consume:

- `/api/research/reports`
- `/api/research/recommendations`
- `/api/research/recommendations/performance`
- `/api/research/strategy-evolution`

## Efectos visuales reducidos

Cambios aplicados:

- removido GSAP del shell compartido
- removido GSAP explicito de `dashboard.js`
- anulada logica de tilt dependiente del cursor
- anulados transforms agresivos en hover
- reducidos glow, particulas y pixel lanes
- conservadas transiciones ligeras y skeleton loading

## Validacion visual

Paginas validadas con HTTP 200:

- `/dashboard`
- `/analytics`
- `/research`
- `/ai-data`
- `/simulator`

Capturas:

- `/home/docs/research-after.png`
- `/home/docs/dashboard-after-final.png`
- `/home/docs/analytics-after-final.png`

## Persistencia

Imagen actualizada:

- `aterum-dashboard:local`

Commit Docker:

- `053ea2df9d5c`

