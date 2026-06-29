# Arquitectura HTTPS

```mermaid
flowchart LR
  DNS[DuckDNS<br/>aterum.duckdns.org] --> SG[AWS Security Group<br/>80/443]
  SG --> NGINX[nginx<br/>TLS 443]
  LE[Let's Encrypt] -->|HTTP-01 :80| NGINX
  CERT[certbot.timer<br/>/etc/letsencrypt] --> NGINX
  NGINX --> DASH[Dashboard + API<br/>3001]
  NGINX --> CHART[Chart API<br/>3000]
  NGINX --> N8N[n8n<br/>5678]
  TELEGRAM[Telegram] <-->|long polling| TGCTRL[telegram-control<br/>read-only]
  TGCTRL --> DASH
  TGCTRL --> MYSQL
  TGCTRL --> REDIS
  TGCTRL -->|SQLite RO| N8N
  DASH --> MYSQL[(MariaDB)]
  DASH --> REDIS[(Redis)]
  N8N --> DASH
```

```mermaid
flowchart TD
  HTTP[http://aterum.duckdns.org] --> REDIRECT[301 HTTPS]
  HTTPS[https://aterum.duckdns.org] --> ROUTER{nginx routes}
  ROUTER --> GUI[/GUI pages/]
  ROUTER --> API[/API/]
  ROUTER --> EDITOR[/n8n editor/]
  ROUTER --> HOOKS[/n8n webhooks/]
```

El dominio se inyecta con `APP_DOMAIN`. Los contratos internos permanecen en HTTP local y no salen del host/namespace Docker.

Telegram Control no está publicado por nginx. Sus roles viewer/moderator/admin sólo habilitan consultas y operaciones analíticas; no existen acciones de trading.
