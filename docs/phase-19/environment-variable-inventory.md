# Phase 19 — Production Environment Variable Inventory

**Classification**: Confidential Engineering Specification  
**System**: Secure Social Networking and Digital Matchmaking Platform  
**Phase**: Phase 19 — Critical Security Remediation & Production Readiness  
**Status**: Names only. No secret values. Phase 20 confirmed production startup rejects `OTP_PROVIDER=dev` and an empty `WEBRTC_TURN_URL`. Live provider values were not supplied.  

---

## 1. Executive Summary & Security Rules

All configuration parameters in the platform are centralized in `backend/src/config/environment.js` for the API and read from Vite build-time environment files for the single-page application. Modules **never** invoke `process.env` directly in application runtime paths.

### Security Directives:
1. **Zero Secret Leakage**: Do not commit `JWT_SECRET`, `OTP_SECRET`, `DB_PASSWORD`, `SMTP_PASS`, `TWILIO_AUTH_TOKEN`, or `WEBRTC_TURN_SECRET`. Profile-photo signatures use `JWT_SECRET`. There is no separate photo-signing variable.
2. **Strict Production Validation**: When `NODE_ENV=production`, the application executes startup sanity checks (`validateEnvironment()` and `validateProductionReadiness()`). If weak fallback keys, missing database URLs, wildcards in CORS origins, or `OTP_PROVIDER=dev` are detected, the process terminates immediately with an exit code of `1`.
3. **Frontend Isolation**: Variables intended for the React client are prefixed with `VITE_`. No backend secrets may ever carry the `VITE_` prefix.

---

## 2. Backend Environment Variables

| Variable Name | Category | Scope | Type | Required? | Default / Example | Security Classification | Purpose & Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Core Runtime | Backend | Enum | **Required** | `development` / `production` / `test` | Internal | Controls execution environment, error verbosity, strict configuration validation, and dev-mode toggles. |
| `PORT` | Core Runtime | Backend | Integer | Optional | `5000` | Internal | TCP port on which the Express HTTP server and Socket.IO gateway bind. |
| `TRUST_PROXY` | Networking | Backend | String / Int | **Required in Prod** | `1` (or hop count / CIDR) | Internal | Configures Express reverse-proxy trust. Essential for rate limiters to see real client IPs rather than load balancer IPs. |
| `CORS_ORIGIN` | Networking | Backend | Comma-list | **Required in Prod** | `https://app.example.com` | Internal | Allowed client origins. Wildcard `*` is strictly blocked in production. |
| `DB_CLIENT` | Database | Backend | Enum | **Required** | `postgres` (or `mysql`) | Internal | Database dialect. Handled through Knex.js abstraction. |
| `DATABASE_URL` | Database | Backend | URI | **Required (or split)** | `postgresql://user:pass@host:5432/db` | **Confidential / Secret** | Complete database connection URI with embedded credentials and connection parameters. |
| `DB_HOST` | Database | Backend | String | Optional (if URL set)| `127.0.0.1` | Internal | Database host when `DATABASE_URL` is not supplied. |
| `DB_PORT` | Database | Backend | Integer | Optional | `5432` | Internal | Database TCP port. Defaults to 5432 for Postgres, 3306 for MySQL. |
| `DB_DATABASE` | Database | Backend | String | Optional (if URL set)| `matchmaking_platform` | Internal | Target database schema name. |
| `DB_USERNAME` | Database | Backend | String | Optional (if URL set)| `app_user` | Internal | Database username. |
| `DB_PASSWORD` | Database | Backend | String | Optional (if URL set)| `******` | **Confidential / Secret** | Database password. |
| `DB_POOL_MIN` | Database | Backend | Integer | Optional | `0` | Internal | Minimum connection pool allocations. |
| `DB_POOL_MAX` | Database | Backend | Integer | Optional | `10` | Internal | Maximum connection pool allocations. |
| `DB_SSL` | Database | Backend | Boolean/String | Optional | `require` / `false` | Internal | Enforces TLS encrypted connection to database instance in cloud environments. |
| `JWT_SECRET` | Security & Auth | Backend | String (Hex/Base64)| **Required** | (Minimum 32 random chars) | **High Secret** | Cryptographic key used to sign and verify HMAC-SHA256 user authentication JWTs. |
| `JWT_EXPIRES_IN` | Security & Auth | Backend | String | Optional | `1d` | Internal | Expiration duration for user sessions (e.g., `15m`, `12h`, `1d`). |
| `OTP_SECRET` | Security & Auth | Backend | String (Hex/Base64)| **Required in Prod** | (Minimum 32 random chars) | **High Secret** | HMAC key used to generate non-reversible hashes of OTPs stored in database. Falls back to JWT_SECRET in dev only. |
| `OTP_PROVIDER` | Messaging | Backend | Enum | **Required in Prod** | `smtp` / `twilio` / `production` | Internal | Outgoing delivery provider. Setting to `dev` in production immediately halts startup. |
| `OTP_LENGTH` | Messaging | Backend | Integer | Optional | `6` | Internal | Digit length of verification codes. |
| `OTP_EXPIRY_MINUTES` | Messaging | Backend | Integer | Optional | `5` | Internal | Code expiration window in minutes. |
| `OTP_MAX_ATTEMPTS` | Messaging | Backend | Integer | Optional | `5` | Internal | Maximum verification attempts before the OTP token is invalidated. |
| `OTP_RESEND_COOLDOWN_SECONDS`| Messaging | Backend | Integer | Optional | `60` | Internal | Minimum cooldown period between consecutive OTP generation requests. |
| `OTP_MAX_SENDS_PER_HOUR` | Messaging | Backend | Integer | Optional | `5` | Internal | Account-level ceiling on OTPs generated per hour. |
| `SMTP_HOST` | Messaging | Backend | FQDN | Cond. Required | `smtp.sendgrid.net` | Internal | Outgoing SMTP host for transactional emails. Required if provider is `smtp` or `production`. |
| `SMTP_PORT` | Messaging | Backend | Integer | Cond. Required | `587` | Internal | SMTP port (typically 587 for STARTTLS, 465 for TLS). |
| `SMTP_SECURE` | Messaging | Backend | Boolean | Optional | `false` | Internal | `true` if port 465 TLS is used; `false` if port 587 STARTTLS. |
| `SMTP_USER` | Messaging | Backend | String | Cond. Required | `apikey` | Internal | SMTP authentication username. |
| `SMTP_PASS` | Messaging | Backend | String | Cond. Required | `******` | **Confidential / Secret** | SMTP authentication secret / API key. |
| `SMTP_FROM` | Messaging | Backend | Email string | Cond. Required | `Matchmaking <noreply@example.com>` | Internal | Validated From header address for outgoing platform correspondence. |
| `TWILIO_ACCOUNT_SID` | Messaging | Backend | String | Cond. Required | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Internal | Twilio account identifier. Required if provider is `twilio` or `production`. |
| `TWILIO_AUTH_TOKEN` | Messaging | Backend | String | Cond. Required | `******` | **Confidential / Secret** | Twilio authentication token for REST API calls. |
| `TWILIO_FROM_NUMBER` | Messaging | Backend | E.164 String | Cond. Required | `+15551234567` | Internal | Twilio registered phone number for SMS delivery. |
| `LOGIN_VERIFICATION_EXPIRY_MINUTES` | Security | Backend | Integer | Optional | `5` | Internal | Validity window for camera live-presence challenges. |
| `LOGIN_VERIFICATION_MAX_ATTEMPTS` | Security | Backend | Integer | Optional | `5` | Internal | Maximum attempts allowed to satisfy a presence challenge. |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | Security | Backend | Integer | Optional | `15` | Internal | Sliding window size for auth IP rate limiting. |
| `AUTH_RATE_LIMIT_MAX` | Security | Backend | Integer | Optional | `100` | Internal | Maximum requests per IP across auth endpoints in window. |
| `AUTH_FAILED_ATTEMPTS_MAX` | Security | Backend | Integer | Optional | `10` | Internal | Maximum failed authentication attempts per IP+account before cooldown. |
| `DEFAULT_COUNTRY_CODE` | Core | Backend | String | Optional | `+91` | Internal | Country prefix added to 10-digit phone inputs missing E.164 country code. |
| `STORAGE_PROVIDER` | Media Storage | Backend | Enum | Optional | `local` (or `s3`) | Internal | Storage engine for profile pictures. |
| `UPLOADS_DIR` | Media Storage | Backend | Path | Optional | `uploads` | Internal | Local directory path where profile photos are stored in WebP format. |
| `PRIVATE_UPLOADS_DIR` | Media Storage | Backend | Path | Optional | `uploads-private` | Internal | Local directory path where private chat image attachments are stored. |
| `MEDIA_PUBLIC_BASE_URL` | Media Storage | Backend | URL | **Required in Prod** | `https://api.example.com` | Internal | Public origin prepended to generated media URLs. |
| `PROFILE_PHOTO_SIGNING_SECRET` | Media Storage | Backend | String | Optional in Dev | (Minimum 32 random chars) | **Confidential / Secret** | Secret HMAC key used to generate tamper-proof signed profile photo URLs. Falls back to JWT_SECRET if unset. |
| `PROFILE_PHOTO_URL_EXPIRY_SECONDS`| Media Storage | Backend | Integer | Optional | `3600` (1 hour) | Internal | Expiration lifetime in seconds for signed profile photo URLs. |
| `PROFILE_IMAGE_MAX_SIZE_MB` | Media Storage | Backend | Float | Optional | `5` | Internal | Maximum upload size accepted for profile photo uploads. |
| `PROFILE_IMAGE_MAX_DIMENSION` | Media Storage | Backend | Integer | Optional | `1024` | Internal | Max pixel width/height (Sharp resizes images to fit this box). |
| `CHAT_IMAGE_MAX_SIZE_MB` | Media Storage | Backend | Float | Optional | `5` | Internal | Maximum upload size for chat image attachments. |
| `CHAT_IMAGE_MAX_DIMENSION` | Media Storage | Backend | Integer | Optional | `1600` | Internal | Max pixel width/height for chat images. |
| `QUIZ_QUESTIONS_FILE` | Matchmaking | Backend | Path | Optional | `src/config/quiz-questions.json` | Internal | Relative or absolute path to questionnaire items JSON definition. |
| `RECOMMENDATION_DEFAULT_LIMIT`| Matchmaking | Backend | Integer | Optional | `20` | Internal | Default recommendation candidate limit per request. |
| `RECOMMENDATION_MAX_LIMIT` | Matchmaking | Backend | Integer | Optional | `100` | Internal | Absolute ceiling on recommendation candidate limit. |
| `MESSAGE_DEFAULT_LIMIT` | Chat | Backend | Integer | Optional | `50` | Internal | Default page size for message history pagination. |
| `MESSAGE_MAX_LIMIT` | Chat | Backend | Integer | Optional | `100` | Internal | Maximum allowed page size for message history queries. |
| `MESSAGE_MAX_LENGTH` | Chat | Backend | Integer | Optional | `2000` | Internal | Character limit on private text messages. |
| `MESSAGE_RATE_LIMIT` | Chat | Backend | Integer | Optional | `60` | Internal | Max messages allowed per window per user across HTTP and Socket.IO. |
| `MESSAGE_RATE_WINDOW_SECONDS` | Chat | Backend | Integer | Optional | `60` | Internal | Window duration in seconds for message rate limiting. |
| `TURN_SERVER_URLS` | WebRTC / Video | Backend | Comma-list | **Required in Prod** | `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp` | Internal | List of STUN/TURN relay server URIs. |
| `TURN_AUTH_SECRET` | WebRTC / Video | Backend | String | **Required in Prod** | `******` | **Confidential / Secret** | Coturn shared secret used to sign ephemeral RFC 7635 HMAC-SHA1 credentials. |
| `TURN_CREDENTIAL_TTL_SECONDS` | WebRTC / Video | Backend | Integer | Optional | `86400` (24 hours) | Internal | Lifetime of generated ephemeral TURN credentials. |
| `TURN_USERNAME` | WebRTC / Video | Backend | String | Optional | - | Internal | Static username for non-ephemeral fallback TURN setups. |
| `TURN_PASSWORD` | WebRTC / Video | Backend | String | Optional | `******` | **Confidential / Secret** | Static password for non-ephemeral fallback TURN setups. |
| `LOG_LEVEL` | Observability | Backend | Enum | Optional | Check `environment.js` before relying on this name. | Internal | Only set this if the logger in the repository reads it. |

---

## 3. Frontend Environment Variables (Vite Client)

| Variable Name | Category | Scope | Type | Required? | Example Value | Security Classification | Purpose & Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | API Gateway | Frontend | URL / Path | **Required** | `https://api.example.com/api` or `/api` | Public | Base endpoint where frontend services dispatch REST API requests. Can be relative if proxied. |
| `VITE_SOCKET_URL` | WebSockets | Frontend | URL / Path | **Required** | `https://api.example.com` or `/` | Public | Host origin for Socket.IO WebSocket and polling connections. |
| `VITE_ENABLE_CAMERA_VERIFICATION` | Feature Flag | Frontend | Boolean | Optional | `true` | Public | Enables browser live camera presence capture during authentication workflows. |
| `VITE_DEBUG_WEBRTC` | Diagnostics | Frontend | Boolean | Optional | `false` | Public | Logs RTCPeerConnection lifecycle events, candidate types, and ICE states in the browser console. |

---

## 4. Production Readiness Validation Script

The application automatically validates these variables upon process boot. In production mode (`NODE_ENV=production`), invocation of `validateProductionReadiness()` asserts:
1. `JWT_SECRET` is defined, not equal to default development strings (`development-insecure-jwt-secret...`), and at least 32 characters long.
2. `OTP_SECRET` is defined, distinct from fallbacks, and at least 32 characters long.
3. `OTP_PROVIDER` is not set to `dev` (must be `smtp`, `twilio`, or `production`).
4. If `OTP_PROVIDER` involves SMTP, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` are non-empty.
5. If `OTP_PROVIDER` involves Twilio, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are non-empty.
6. `CORS_ORIGIN` contains no wildcard `*` entries and is properly formatted.
7. Database connection parameters (`DATABASE_URL` or individual credentials) are populated.
8. If WebRTC video calling is deployed to production, `TURN_SERVER_URLS` and `TURN_AUTH_SECRET` are present.
