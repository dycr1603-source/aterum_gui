# Arquitectura reconstruida

La arquitectura final preserva los contratos historicos que aparecen en los workflows: n8n espera hablar con el backend en `http://127.0.0.1:3001`, con la chart API en `http://localhost:3000` y consigo mismo en `http://127.0.0.1:5678/webhook/...`.

## Telegram Control

```mermaid
flowchart LR
  Telegram <-->|long polling| TC[telegram-control read-only]
  TC -->|APIs existentes| DASH[Dashboard API]
  TC --> MYSQL[(telegram_users + telegram_audit + eventos)]
  TC --> REDIS[(PING)]
  TC -->|health + SQLite RO| N8N[n8n]
```

El sidecar no participa en el flujo de trading. Los nodos Telegram de n8n siguen enviando notificaciones de operaciones y reportes de forma independiente. Dentro del grupo, `telegram_users` aplica roles viewer/moderator/admin antes de consultar cualquier fuente.

El Copiloto aplica un router local-first dentro del mismo sidecar: comandos e intenciones conocidas usan APIs existentes, las FAQs se resuelven desde conocimiento local y sólo las preguntas transversales llegan a Claude con contexto compacto. `telegram_ai_usage` y `telegram_ai_cache` hacen visible el uso, la latencia y el ahorro.

```mermaid
flowchart LR
  Q[Comando o pregunta] --> R{Router local-first}
  R -->|Comando| API[APIs existentes]
  R -->|FAQ| KB[Knowledge local]
  R -->|Razonamiento| CACHE{Cache}
  CACHE -->|hit| RESP[Respuesta]
  CACHE -->|miss| CLAUDE[Claude + contexto minimo]
  API --> METRICS[(telegram_ai_usage)]
  KB --> METRICS
  CLAUDE --> METRICS
```

```mermaid
sequenceDiagram
  participant U as Usuario Telegram
  participant TC as telegram-control
  participant DB as telegram_users/audit
  participant API as APIs existentes
  U->>TC: /why BTCUSDT o @Delcon8n_bot status
  TC->>DB: validar grupo, enabled y rol
  TC->>API: consultar contratos read-only
  API-->>TC: datos reales persistidos/live
  TC->>DB: guardar respuesta, endpoints, duración y resultado
  TC-->>U: MarkdownV2 + InlineKeyboard
```

Para mantener esa compatibilidad sin reescribir workflows, los servicios `dashboard`, `aterum_gui` y `n8n` comparten namespace de red mediante `network_mode: "service:dashboard"`.

## Servicios Docker

| Servicio | Imagen/build | Puerto host | Puerto interno | Rol |
| --- | --- | --- | --- | --- |
| `mysql` | `mariadb:11.4` | no expuesto | `3306` | Persistencia relacional: trades, cierres, scans, rechazos, circuit breaker, post-trade. |
| `redis` | `redis:7-alpine` | no expuesto | `6379` | Servicio esperado de infraestructura. Reservado para estado/caches/colas si se activa en n8n o backend. |
| `dashboard` | build `./aterum_gui` | `3001`, `3000`, `5678` | `3001` | API dashboard, endpoints `/db/*`, `/cb/*`, `/cooldown/*`, `/trade/*`, inteligencia. |
| `aterum_gui` | misma imagen que dashboard | comparte red con `dashboard` | `3000` | Chart API `/chart` y healthcheck. |
| `n8n` | `n8nio/n8n` | comparte puerto `5678` via dashboard | `5678` | Ejecucion/importacion de workflows. |
| `telegram_control` | `aterum-dashboard:local` | no expuesto | `3090` health interno | RBAC, consultas, Copiloto local-first, cache y auditoria. |
| `position_guard` | `aterum-dashboard:local` | no expuesto | `3091` health interno | Auditoría de protección, reconciliación, alertas y cierre de emergencia con espera. |
| `nginx` | `nginx:1.27-alpine` | `80` | `80` | Reverse proxy hacia dashboard, chart API y n8n. |

## Diagrama de componentes

```mermaid
flowchart LR
  subgraph Host["Host / docker compose"]
    NGINX["nginx :80"]
    MYSQL["mysql / MariaDB :3306"]
    REDIS["redis :6379"]
    TC["telegram-control :3090"]
    PG["position-guard :3091"]

    subgraph SharedNS["Namespace compartido dashboard"]
      DASH["dashboard API :3001"]
      CHART["chart API :3000"]
      N8N["n8n :5678"]
    end
  end

  WF["Workflows n8n"] -->|"http://127.0.0.1:3001/db/*"| DASH
  WF -->|"http://127.0.0.1:3001/cb/*"| DASH
  WF -->|"http://127.0.0.1:3001/cooldown/*"| DASH
  WF -->|"http://127.0.0.1:3001/trade"| DASH
  WF -->|"http://localhost:3000/chart"| CHART
  WF -->|"http://127.0.0.1:5678/webhook/sl-monitor-*"| N8N

  DASH --> MYSQL
  DASH --> REDIS
  NGINX --> DASH
  NGINX --> CHART
  NGINX --> N8N
  TC --> DASH
  TC --> MYSQL
  TC --> REDIS
  PG --> MYSQL
  PG --> REDIS
  PG --> N8N
  PG --> BINANCE
  PG --> TELEGRAM

  WF --> BINANCE["Binance Futures API"]
  WF --> ANTHROPIC["Anthropic Messages API"]
  WF --> TELEGRAM["Telegram Bot API"]
  WF --> FNG["Alternative.me F&G"]
  DASH --> OPENAI["OpenAI API"]
  DASH --> BINANCE
```

La matriz autoritativa de creación, modificación y cancelación de órdenes está en [order-responsibility-audit.md](./order-responsibility-audit.md). Position Guard no crea ni modifica SL/TP.

## Flujo de apertura de trade

```mermaid
sequenceDiagram
  participant N8N as Advanced AI Trading Bot
  participant DASH as Dashboard API :3001
  participant CHART as Chart API :3000
  participant DB as MySQL
  participant BIN as Binance Futures
  participant TG as Telegram

  N8N->>DASH: GET /cb/status
  N8N->>DASH: GET /cooldown/status
  N8N->>BIN: ticker/klines/funding/openInterest
  N8N->>CHART: GET /chart?symbol=...
  N8N->>DASH: GET /intelligence/signal
  N8N->>DASH: GET /api/simulator/policy
  N8N->>BIN: orden futures si pasa scoring/riesgo
  N8N->>DASH: POST /db/trade/open
  DASH->>DB: INSERT trades
  N8N->>DASH: POST /trade
  N8N->>N8N: POST /webhook/sl-monitor-set
  N8N->>TG: aviso operativo
```

## Flujo SL Monitor / cierre

```mermaid
sequenceDiagram
  participant SLM as SL Monitor
  participant DASH as Dashboard API :3001
  participant DB as MySQL
  participant BIN as Binance Futures
  participant TG as Telegram

  SLM->>BIN: consultar posiciones/precios
  SLM->>DASH: POST /db/trade/close
  DASH->>DB: UPDATE trades + INSERT trade_closes
  SLM->>DASH: POST /cb/sl o /cb/tp
  DASH->>DB: INSERT circuit_breaker
  SLM->>DASH: POST /cooldown/set
  SLM->>DASH: DELETE /trade/:symbol
  SLM->>DASH: POST /db/post-trade
  SLM->>TG: aviso cierre
```

## Flujo Trailing Manager

```mermaid
sequenceDiagram
  participant TM as Trailing Manager
  participant N8N as n8n Webhook SL Monitor
  participant DASH as Dashboard API :3001
  participant BIN as Binance Futures

  TM->>N8N: GET /webhook/sl-monitor-get
  TM->>BIN: klines/price/exchangeInfo
  TM->>BIN: modificar stop si aplica
  TM->>DASH: POST /db/trade/update-sl
  TM->>N8N: POST /webhook/sl-monitor-set
  TM->>DASH: POST /trade
```

## Contratos internos clave

- n8n espera `127.0.0.1:3001`; por eso no se reemplazo por nombre DNS Docker.
- Chart API espera `localhost:3000`; se conserva dentro del namespace compartido.
- Webhooks SL usan `127.0.0.1:5678/webhook/sl-monitor-*`.
- MySQL no se expone al host por defecto; solo lo consume el backend.
- nginx permite acceso unificado desde el host en `http://127.0.0.1/`.
