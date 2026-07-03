# Arquitectura del bot

## Servicios

```mermaid
flowchart LR
  Internet --> DNS[aterum.duckdns.org]
  DNS --> NGINX[nginx :80/:443 TLS]
  NGINX --> GUI[Dashboard y GUI :3001]
  NGINX --> N8N[n8n :5678]
  NGINX --> CHART[Chart API :3000]
  TELEGRAM[Telegram] <-->|long polling| TGCTRL[telegram-control]
  TGCTRL --> GUI
  TGCTRL --> MYSQL
  TGCTRL --> REDIS
  TGCTRL -->|health + SQLite RO| N8N
  GUARD[position-guard] --> MYSQL
  GUARD --> BINANCE
  GUARD --> TELEGRAM
  GUARD -->|health + SQLite RO| N8N

  N8N -->|execution request| GUARD
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

Telegram Control incorpora un router local-first: comandos sobre APIs existentes, conocimiento local para FAQs y Claude sólo para razonamiento con contexto compacto. `telegram_ai_usage` y `telegram_ai_cache` auditan coste, latencia y reutilización sin participar en decisiones de trading.

## Flujo de trading

```mermaid
flowchart TD
  S[Schedule n8n] --> RG[Risk Guard]
  RG --> MC[Contexto determinista]
  MC --> SCAN[Opportunity Discovery]
  SCAN --> SCORE[Score aditivo + Learning acotado]
  SCORE --> RANK[Portfolio Ranking]
  RANK --> LEARN[Deterministic Entry Gate]
  LEARN -->|Aprobado| SIZE[Position Sizer]
  LEARN -->|Rechazado| TELEMETRY[market_opportunities + rechazo]
  SIZE --> REQUEST[Execution Request]
  REQUEST --> ENGINE[Binance Execution Engine]
  ENGINE --> VERIFY[Read-back position + protection]
  VERIFY -->|verified| ORDER[Persist local state]
  VERIFY -->|failed| FAILURE[Error event + failure notification]
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
| n8n | Orquestación, cálculo de riesgo/trailing y solicitudes de ejecución; no muta órdenes Binance | SQLite n8n + MySQL via API |
| Dashboard API | Contratos `/api`, `/db`, learning, research y estado live | MariaDB + Redis |
| Position Guard / Execution Engine | Único escritor Binance, verificación read-back y sincronización Binance → local | MariaDB + Binance |
| GUI | Trading, Analytics, Simulator, Intelligence y Research | Sin estado autoritativo |
| MariaDB | Trades, cierres, telemetria, research y learning | Volumen `mysql_data` |
| Redis | Estado/cache efimero | Volumen `redis_data` |
| nginx | Entrada publica y reverse proxy | Configuracion versionada |
| telegram-control | Centro de operaciones multiusuario con RBAC | `telegram_users`, `telegram_audit` |

## Contratos de red

| Ruta publica | Destino |
|---|---|
| `/` y `/api` | Dashboard/GUI `:3001` |
| `/chart` | Chart API `:3000` |
| `/n8n/`, `/rest/`, `/webhook/` | n8n `:5678` |
| `/ws` | WebSocket del dashboard |

La entrada canonica es `https://aterum.duckdns.org`; HTTP solo atiende ACME y redirige. Los puertos `3000`, `3001` y `5678` estan ligados a `127.0.0.1` y no permiten bypass publico de nginx.

La arquitectura TLS detallada se encuentra en [`../infra/architecture.md`](../infra/architecture.md).

Los workflows historicos usan `127.0.0.1`. Por compatibilidad, Dashboard, Chart API y n8n comparten namespace de red en Compose.

La separacion detallada de responsabilidades de ordenes se documenta en [`../../docs/architecture/order-responsibility-audit.md`](../../docs/architecture/order-responsibility-audit.md).
