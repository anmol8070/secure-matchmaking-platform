# Phase 19 — Provider-Independent Production Deployment Specification

**System**: Secure Social Networking and Digital Matchmaking Platform  
**Document**: Production Hosting & Operational Deployment Guide  
**Status**: Specification only. Nothing in this document was provisioned on a host. Phase 20 rehearsed schema restore on an isolated MySQL database and then dropped it. See [../phase-20/README.md](../phase-20/README.md).  

---

## 1. Architectural Overview & Topology

The Secure Social Networking and Digital Matchmaking Platform is built upon a decoupled, modern multi-tier architecture designed for horizontal scalability, high availability, zero secret leakage, and defense in depth.

```
                              [ HTTPS: 443 / WSS ]
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │ Cloud Load Balancer / Reverse │
                       │    Proxy (Nginx / Caddy / AWS)│
                       │   - TLS Termination (Certbot) │
                       │   - WAF & Rate Limiting Guard │
                       └───────┬───────────────┬───────┘
                               │               │
            Static Assets (SPA)│               │ REST API & WebSocket Upgrades
                               ▼               ▼
                     ┌──────────────────┐    ┌─────────────────────────────────┐
                     │  React Frontend  │    │      Node.js / Express API      │
                     │  Static Hosting  │    │     Container Pods (Cluster)    │
                     │  (CDN / Nginx)   │    │    - Port 5000                  │
                     └──────────────────┘    │    - Socket.IO Gateway          │
                                             └───────┬──────────┬──────────────┘
                                                     │          │
                     ┌───────────────────────────────┘          │
                     ▼                                          ▼
      ┌─────────────────────────────┐           ┌──────────────────────────────┐
      │  Relational Database (RDBMS)│           │   Private Object Storage     │
      │  - PostgreSQL 15+ / MySQL 8 │           │   - AWS S3 / MinIO / Local   │
      │  - Persistent SSD Volume    │           │   - Access Controlled        │
      │  - Automated Daily Backups  │           │   - Ephemeral Signed URLs    │
      └─────────────────────────────┘           └──────────────────────────────┘
                     ▲
                     │ [STUN: 3478 / TURNS: 5349]
      ┌─────────────────────────────┐
      │  coturn WebRTC Relay Server │
      │  - Public Static IP / EIP   │
      │  - UDP/TCP Relay Ports      │
      │  - RFC 7635 Ephemeral Auth  │
      └─────────────────────────────┘
```

---

## 2. Component Hosting Specifications

### 2.1 React Frontend Hosting
- **Build Artifacts**: Generated via `npm run build` within `frontend/`. Produces static distribution in `frontend/dist/`.
- **Hosting Options**:
  - *Option A (CDN / Object Storage)*: AWS S3 + CloudFront, Cloudflare Pages, Netlify, or Vercel.
  - *Option B (Reverse Proxy Static Root)*: Nginx or Caddy serving `/usr/share/nginx/html`.
- **Routing Requirement**: Single Page Application (SPA) HTML5 history routing. All non-file URI requests (`/*`) must rewrite to `/index.html` with status HTTP 200.
- **Security Headers Enforced at Proxy**:
  ```nginx
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:;" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=()" always;
  ```

### 2.2 Node.js / Express Backend Hosting
- **Runtime**: Node.js LTS (v20 or v22) in containerized Alpine Linux (`node:20-alpine`).
- **Process Management**: Docker container managed via Kubernetes, AWS ECS, or Docker Compose with restart policies (`restart: unless-stopped`).
- **Cluster Mode**: PM2 or native container replication with cluster load balancing.
- **Port**: Binds internally to `0.0.0.0:5000`.

### 2.3 Persistent Relational Database
- **Engines Supported**:
  - PostgreSQL 15+ (Recommended)
  - MySQL 8.0+
- **Configuration**:
  - Dedicated managed instance (e.g. AWS RDS, DigitalOcean Managed DB) or container with persistent SSD volume mount.
  - Connection pooling managed via Knex pool (`DB_POOL_MIN=2`, `DB_POOL_MAX=20`).
  - SSL/TLS encryption enforced (`DB_SSL=require`).
  - Automated WAL archiving / point-in-time recovery enabled.

### 2.4 Private File Storage
- **Directory Layout**:
  - `/uploads`: Profile photos in WebP format. Access-controlled via `/media/profile-photos/:filename` with signed URL tokens (`?exp=&sig=`) or Bearer authentication.
  - `/uploads-private`: In-flight chat attachments. Served strictly to conversation participants via `/messages/:id/image`.
- **Production Storage Options**:
  - Dedicated persistent volume mount (`/app/uploads` and `/app/uploads-private`).
  - Cloud Object Storage (AWS S3 or Cloudflare R2) mounted via CSI driver or configured via storage adapter.

---

## 3. Reverse Proxy, HTTPS, and WebSocket Configuration

A production reverse proxy (e.g. Nginx) terminates SSL/TLS and routes requests to the frontend static directory and backend Node.js API.

### Sample Production Nginx Configuration (`nginx.conf`):
```nginx
upstream backend_cluster {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    server_name matchmaking.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name matchmaking.example.com;

    ssl_certificate /etc/letsencrypt/live/matchmaking.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/matchmaking.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend Single Page App
    location / {
        root /var/www/matchmaking/frontend/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # REST API Gateway
    location /api/ {
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Protected Media Storage
    location /media/ {
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSockets / Socket.IO Signaling Gateway
    location /socket.io/ {
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 4. Production WebRTC TURN Server (coturn) Setup

WebRTC video calling requires a dedicated TURN relay server with a public IP to traverse symmetric NATs and enterprise firewalls.

### 4.1 Server Requirements
- Ubuntu 22.04 LTS VM with dedicated Elastic/Static IPv4.
- Opened UDP/TCP ports: `3478` (STUN/TURN), `5349` (TURNS/TLS), and UDP relay port range `49152-65535`.

### 4.2 Coturn Configuration (`/etc/turnserver.conf`)
```ini
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=PROD_HIGH_ENTROPY_TURN_SECRET_64_HEX
realm=turn.matchmaking.example.com
total-quota=100
bps-capacity=0
stale-nonce
cert=/etc/letsencrypt/live/turn.matchmaking.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.matchmaking.example.com/privkey.pem
min-port=49152
max-port=65535
verbose
no-cli
no-loopback-peers
no-multicast-peers
```

### 4.3 Application Backend Binding
In the Node.js backend environment:
```env
TURN_SERVER_URLS=turn:turn.matchmaking.example.com:3478?transport=udp,turn:turn.matchmaking.example.com:3478?transport=tcp,turns:turn.matchmaking.example.com:5349?transport=tcp
TURN_AUTH_SECRET=PROD_HIGH_ENTROPY_TURN_SECRET_64_HEX
TURN_CREDENTIAL_TTL_SECONDS=86400
```
The backend automatically issues short-lived RFC 7635 credentials per authenticated user session via `GET /calls/ice-servers`.

---

## 5. Production Transactional OTP Delivery Setup

Development outbox (`OTP_PROVIDER=dev`) is strictly prohibited in production. Configure one of the production adapters:

### 5.1 SMTP Provider Configuration
Recommended for email-based verification:
```env
OTP_PROVIDER=smtp
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.prod_api_key_here
SMTP_FROM=Secure Matchmaking <verify@matchmaking.example.com>
```

### 5.2 Twilio SMS Provider Configuration
Recommended for SMS-based mobile verification:
```env
OTP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACprod_sid_here
TWILIO_AUTH_TOKEN=prod_token_here
TWILIO_FROM_NUMBER=+15550198372
```

### 5.3 Unified Production Router
Supports intelligent multi-channel routing (email addresses receive email OTPs via SMTP; mobile numbers receive SMS OTPs via Twilio):
```env
OTP_PROVIDER=production
```
*(Requires both SMTP and Twilio variables defined).*

---

## 6. Database Migrations, Health Checks & Observability

### 6.1 Database Migrations
Migrations are managed via Knex.js. Execute forward migrations prior to rolling out new application code:
```bash
# In backend container:
npm run migrate
```
To verify current migration status:
```bash
npx knex migrate:status --knexfile src/config/knexfile.js
```

### 6.2 Health Check Endpoints
Container orchestrators (Docker Swarm, Kubernetes, AWS ECS) must probe the following endpoints:

| Endpoint | Method | Expected HTTP Status | Purpose |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | 200 OK | Process vitality and uptime. |
| `/health/live` | `GET` | 200 OK | Kubernetes liveness probe. Checks event loop responsiveness. |
| `/health/ready` | `GET` | 200 OK (503 if DB down) | Kubernetes readiness probe. Performs active database ping query (`SELECT 1`). Traffic is only routed when 200. |

### 6.3 Logging & Monitoring
- The existing request logger. Do not assume a Winston installation that is not in the project.
- Prometheus metrics scrapable at `/metrics` (or ingested via Datadog/CloudWatch agent).
- Sentry or Datadog APM tracing for unhandled exceptions and performance bottlenecks.

---

## 7. Backup, Restoration & Disaster Recovery

### 7.1 Database Backup Strategy
- **Daily Automated Full Dump**:
  ```bash
  pg_dump -Fc -h $DB_HOST -U $DB_USERNAME $DB_DATABASE > /backups/db_$(date +%Y%m%d_%H%M%S).dump
  ```
- **Retention**: Keep 7 daily backups, 4 weekly backups, 12 monthly backups stored in an encrypted, off-site S3 bucket with Object Lock enabled.
- **Restoration Test Routine**:
  ```bash
  pg_restore -c -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE /backups/db_target.dump
  ```

### 7.2 Media Storage Backup
- Periodic rsync or S3 bucket versioning with cross-region replication for `/uploads` and `/uploads-private`.

---

## 8. Deployment & Zero-Downtime Rollback Strategy

### 8.1 Zero-Downtime Blue/Green Deployment
1. **Pre-Deployment**:
   - Provision staging or green backend containers running new image version.
   - Run non-breaking database schema migrations (`npm run migrate`).
   - Validate readiness probe on green containers (`GET /health/ready`).
2. **Cutover**:
   - Shift reverse-proxy upstream pool or load balancer target group to green cluster.
   - Monitor error rates and latency for 10 minutes.
3. **Decommission**:
   - Drain connections from blue cluster and decommission old containers.

### 8.2 Rollback Procedure
If unhandled errors surge:
1. Revert reverse proxy traffic immediately back to blue target group.
2. In case of breaking schema changes, execute down migration:
   ```bash
   npx knex migrate:rollback --knexfile src/config/knexfile.js
   ```
3. Re-deploy previous known-good Docker image tag.
