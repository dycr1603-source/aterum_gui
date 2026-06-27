# Arquitectura del bot

## Servicios

```mermaid
flowchart LR
  Internet --> NGINX[nginx :80]
  NGINX --> GUI[Dashboard y GUI :3001]
  NGINX --> N8N[n8n :5678]
  NGINX --> CHART[Chart API :3000]

  N8N --> BINANCE[Binance Futures]
  N8N --> ANTHROPIC[Anthropic]
  N8N --> TELEGRAM[Telegram]
  N8N --> GUI
  N8N --> MYSQL[(MariaDB)]
  GUI --> MYSQL
  GUI --> REDIS[(Redis)]
  GUI --> BINANCE
  GUI --> N8NDB[(n8n SQLite, solo lectura)]
  CHART --> MARKET[Datos de mercado]
```

## Flujo de trading

```mermaid
flowchart TD
  S[Schedule n8n] --> RG[Risk Guard]
  RG --> MC[Agente de mercado]
  MC --> SCAN[Market Scanner]
  SCAN --> SCORE[Indicadores y scoring 1H/4H]
  SCORE --> VIS{Requiere imagen?}
  VIS -->|Si| IMG[Chart + analisis visual]
  VIS -->|No| AI[AI Market Context]
  IMG --> AII[AI Market Context Image]
  AI --> LEARN[Research Learning Gate]
  AII --> LEARN
  LEARN -->|Aprobado| SIZE[Position Sizer]
  LEARN -->|Rechazado| TELEMETRY[trade_rejections + scan_events]
  SIZE --> ORDER[Execute Trade]
  ORDER --> SL[SL Monitor]
  ORDER --> TRAIL[Trailing Manager]
  SL --> CLOSE[trade_closes]
  TRAIL --> SL
  CLOSE --> POST[Post Trade Agent]
  POST --> RESEARCH[Analytics + AI Research]
```

## Responsabilidades

| Componente | Responsabilidad | Persistencia |
|---|---|---|
| n8n | Orquestacion, señales, ordenes, SL, trailing y reportes | SQLite n8n + MySQL via API |
| Dashboard API | Contratos `/api`, `/db`, learning, research y estado live | MariaDB + Redis |
| GUI | Trading, Analytics, Simulator, Intelligence y Research | Sin estado autoritativo |
| MariaDB | Trades, cierres, telemetria, research y learning | Volumen `mysql_data` |
| Redis | Estado/cache efimero | Volumen `redis_data` |
| nginx | Entrada publica y reverse proxy | Configuracion versionada |

## Contratos de red

| Ruta publica | Destino |
|---|---|
| `/` y `/api` | Dashboard/GUI `:3001` |
| `/chart` | Chart API `:3000` |
| `/n8n/`, `/rest/`, `/webhook/` | n8n `:5678` |
| `/ws` | WebSocket del dashboard |

Los workflows historicos usan `127.0.0.1`. Por compatibilidad, Dashboard, Chart API y n8n comparten namespace de red en Compose.
