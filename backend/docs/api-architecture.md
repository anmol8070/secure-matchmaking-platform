# API Architecture

Backend architecture of the Secure Social Networking and Digital Matchmaking Platform: the base REST API (Phase 3) plus authentication and authorization (Phase 4). For the database design see [database-schema.md](database-schema.md); for registration, OTP, login and live verification see [authentication-flow.md](authentication-flow.md); for profiles and profile pictures (Phase 5) see [profile-management.md](profile-management.md); for preferences, hobbies and quiz answers (Phase 6) see [preferences.md](preferences.md).

## 1. Backend architecture

The backend is a layered Node.js + Express 5 REST API. Each request flows down the layers, and each layer only calls the one below it:

```
HTTP request
  │
  ▼
app.js           security headers, CORS, request logging, body parsing (1 MB limit)
  │
  ▼
routes.js        mounts every module router under /api/v1
  │
  ▼
routes/*Routes   endpoint → [validators] → controller
  │
  ▼
controllers/     HTTP only: read req.validated, call a service, send the response
  │
  ▼
services/        business logic (matching, recommendation, verification, …)
  │
  ▼
models/          data access per table (Knex query builder)
  │
  ▼
config/database  single shared, pooled connection → PostgreSQL / MySQL / MariaDB

Any error thrown in any layer → middleware/errorHandler → { success: false, message, errors? }
```

Rules:
- **Controllers** contain no business logic and never touch the database. An automated architecture test enforces this.
- **Services** hold all business rules. The matching and recommendation logic lives only on the server, so scoring can change without touching the React UI.
- **Only `config/database.js` creates a database connection.** This is also enforced by a test.

## 2. Folder structure

```
backend/
├── src/
│   ├── config/
│   │   ├── environment.js      all env access + production startup checks
│   │   ├── database.js         Knex config, shared pooled connection, testConnection()
│   │   └── cors.js             CORS policy from CORS_ORIGIN
│   ├── constants/
│   │   ├── api.js              API_VERSION, API_PREFIX, body size limit
│   │   ├── httpStatus.js       status code names
│   │   ├── messages.js         client-facing messages
│   │   └── enums.js            allowed values (mirror the DB CHECK constraints)
│   ├── controllers/            healthController + 12 module controllers
│   ├── routes/                 healthRoutes + 12 module route files
│   ├── services/               healthService + 13 module services
│   ├── models/                 BaseModel + 13 table models + index.js
│   ├── middleware/
│   │   ├── requestLogger.js    access log (no query strings, headers or bodies)
│   │   ├── notFound.js         API 404
│   │   └── errorHandler.js     central error → response mapping
│   ├── validators/
│   │   ├── commonValidator.js  validate() middleware + shared schemas
│   │   ├── authValidator.js
│   │   ├── profileValidator.js
│   │   └── preferenceValidator.js
│   ├── utils/
│   │   ├── ApiError.js         operational errors with HTTP status
│   │   ├── apiResponse.js      sendSuccess / sendCreated / error body builder
│   │   ├── dbErrors.js         safe translation of database errors
│   │   ├── logger.js           console logger with redaction
│   │   └── notImplemented.js   501 placeholders for controllers and services
│   ├── db/                     migrations, seeds, schemaHelpers (Phase 2)
│   ├── app.js                  Express app (no listener)
│   └── routes.js               /api/v1 route registry
├── tests/                      unit tests; tests/integration needs a database
├── docs/                       api-architecture.md, database-schema.md, postman/
├── scripts/                    db-create.js, db-reset.js
├── server.js                   entry point
├── knexfile.js
├── .env / .env.example
└── package.json
```

## 3. API versioning

All endpoints live under **`/api/v1`**, defined once in `constants/api.js` as `API_PREFIX`. There are no unversioned routes: `/health` and `/api/health` return 404.

A breaking change will add `/api/v2` as a new router mounted beside v1, so existing clients keep working.

## 4. Route structure

`src/routes.js` mounts each module router. Every module has its own file in `src/routes/`.

| Prefix | Endpoints (✅ implemented — everything else returns 501 until its phase) |
| --- | --- |
| `/health` | ✅ `GET /` (public) |
| `/auth` | ✅ `POST /register`, `POST /send-otp`, `POST /verify-otp`, `POST /login`, `POST /login/send-otp`, `POST /login/verify-otp`, `POST /login-verification/complete` (live presence result → JWT) — public; `POST /logout`, `GET /me` — Bearer token |
| `/profile` | ✅ `GET /`, `POST /`, `PUT /`, `PUT /photo` (multipart, field `photo`), `DELETE /photo` — own profile only (Phase 5); `GET /:userId` → 501 |
| `/preferences` | ✅ `GET /`, `POST /`, `PUT /` (optionally with `hobbyIds` + `quizAnswers`, one transaction), `GET /options`, `PUT /hobbies`, `DELETE /hobbies/:hobbyId`, `GET /quiz`, `PUT /quiz` — own data only (Phase 6) |
| `/hobbies` | ✅ `GET /` — active hobby catalogue (Phase 6; selection lives under `/preferences/hobbies`) |
| `/matches` | `GET /`, `GET /:userId` |
| `/recommendations` | `GET /` |
| `/connections` | `GET /`, `GET /requests`, `POST /requests`, `PATCH /requests/:requestId` |
| `/messages` | `GET /conversations`, `GET /:userId`, `POST /:userId`, `PATCH /:userId/read` |
| `/reports` | `POST /`, `GET /` |
| `/blocks` | `GET /`, `POST /`, `DELETE /:userId` |
| `/feedback` | `POST /`, `GET /` |
| `/admin` | ✅ `POST /login` (public, admins only); admin role required for: `GET /dashboard`, `GET /users`, `GET /users/:userId`, `PATCH /users/:userId/status`, `GET /reports`, `PATCH /reports/:reportId`, `GET /activity`, `GET /monitoring` |

Every module except `/health`, `/auth` and `/admin/login` requires a valid access token (`requireAuth`, applied in `routes.js`); `/admin/*` additionally requires `role = admin`. Planned endpoints of authorised requests return **HTTP 501**:

```json
{ "success": false, "message": "This module will be implemented in a later development phase" }
```

Paths that are not planned return 404, even inside a module (for example `GET /api/v1/auth/unknown`).

Path parameters such as `:userId` are already validated (positive integer → otherwise 422) before the 501.

In development (`NODE_ENV` not production and `OTP_PROVIDER=dev`) one extra route is mounted: `GET /api/v1/dev/otp?destination=…`, which reads the development OTP outbox. It is never mounted in production.

## 5. Controller layer

There is one controller per module in `src/controllers/`. In Phase 3 every handler is a named 501 placeholder, created with `placeholderController([...names])`. Phase 3 contains no business logic.

From Phase 4 onwards, a handler follows this shape:

```js
async function getOwnProfile(req, res) {
  const profile = await profileService.getOwnProfile(req.user.id);
  sendSuccess(res, { data: profile });
}
```

Express 5 forwards rejected promises to the error handler, so controllers need no `try/catch`.

## 6. Service layer

There is one service per module in `src/services/`, also made of 501 placeholders, with each service's planned responsibilities documented in the file. Some separations matter for later phases:

- **`matchingService` and `recommendationService` are separate from each other and from the frontend.**
  - `matchingService` computes compatibility scores and breakdowns.
  - `recommendationService` ranks candidates, excludes blocked users, and adapts weights from activity feedback.
- **`verificationService` handles live human/face *presence* checks at login.** It answers "is a live face present?", never "whose face is this?":
  - it receives only the detector outcome (`face_detected`, `faces_count`, `confidence`);
  - it never receives, stores or compares images;
  - it has no dependency on `profileService`.
  - An architecture test checks that neither service requires the other.
- **`profileService` owns the profile picture** (`profiles.profile_photo_url`): gallery or file upload, optional camera capture, update and replace. It is unrelated to login verification.

Login flow, from a later phase:

```
POST /auth/login ─► authService ─► (credentials/OTP ok)
                                     │
browser camera ─► face/human detection (in browser)
                                     │
POST /auth/login/verification ─► verificationService ─► login_verifications row
                                     │ passed
                                     ▼
                              login completed (JWT issued)
```

## 7. Middleware

Registered in `app.js`, in this order:

| Order | Middleware | Purpose |
| --- | --- | --- |
| 1 | `helmet()` | Security headers (CSP, `nosniff`, frame protection, …); `x-powered-by` disabled |
| 2 | `cors(buildCorsOptions())` | Origin allow-list from `CORS_ORIGIN`; disallowed browser origins get 403 |
| 3 | `requestLogger` | Access log: method, path without query string, status, timing |
| 4 | `express.json` / `express.urlencoded` | Body parsing, 1 MB limit (413 if larger) |
| 5 | `/api/v1` routes | Module routers |
| 6 | `notFound` | `404 API endpoint not found` |
| 7 | `errorHandler` | Central error formatting |

Route-level middleware (Phase 4):

| Middleware | File | Purpose |
| --- | --- | --- |
| `requireAuth` | `middleware/authMiddleware.js` | Bearer JWT → checks signature, expiry, server-side session (not revoked) and active account; sets `req.user`, `req.auth` |
| `requireRole(...roles)` | `middleware/roleMiddleware.js` | Role-based authorization (`403` for the wrong role) |
| `authLimiter` | `middleware/rateLimiter.js` | All `/auth` requests per IP |
| `failedAttemptLimiter` | `middleware/rateLimiter.js` | Failed password/OTP/verification checks per IP + account (no account lockout) |
| `uploadProfileImage` | `middleware/uploadMiddleware.js` | multer (memory) for `PUT /profile/photo`: one file, field `photo`, size limit → 413 (Phase 5) |

Static media (local storage only): `GET /media/<key>` serves uploaded profile pictures from `UPLOADS_DIR`, with long-lived caching and `Cross-Origin-Resource-Policy: cross-origin` so the frontend origin can display them.

## 8. Validation layer

`validators/commonValidator.js` exports `validate({ params, query, body })`, a middleware that uses [zod](https://zod.dev) schemas:

```js
router.get('/:userId', validate({ params: userIdParams }), controller.getProfileByUserId);
```

- Parsed values (coerced to the right types, with unknown keys stripped) are stored on `req.validated.params`, `req.validated.query` and `req.validated.body`. Controllers read from there.
- On failure the request stops with **422**:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "params.userId", "message": "Invalid input: expected number, received NaN" }]
}
```

- Shared building blocks: `id()`, `userIdParams` and `paginationQuery`.
- Module files (`authValidator`, `profileValidator`, `preferenceValidator`) list their planned schemas. The rules themselves are added in the phase that implements each module.

## 9. Database layer

- **`config/database.js`** is the only module that connects to the database.
  - It reads `DB_*` / `DATABASE_URL` from the environment, never from code.
  - It creates a single lazily-created Knex instance (`getDb()`) with a connection pool (`DB_POOL_MIN` / `DB_POOL_MAX`).
  - It forces UTC on MySQL and parses `BIGINT`/`NUMERIC` to numbers on PostgreSQL.
- **`testConnection()`** runs `SELECT 1` at startup. A failure is logged as a warning without credentials, and the API keeps running.
- **`models/`** has one model per Phase 2 table, built on `BaseModel`:
  - `query(trx)` returns a query builder for the table, optionally inside a transaction;
  - `findByPk(key)` supports composite keys (`user_hobbies`);
  - `parseRow()` parses JSON columns returned as text by MariaDB.
- Table-specific queries are added to each model in the phase that needs them.
- Schema changes go through migrations only. See [database-schema.md](database-schema.md).

## 10. Error handling

All errors reach `middleware/errorHandler.js`, so controllers contain no error-formatting code.

| Source | Status | Message |
| --- | --- | --- |
| `ApiError.badRequest` / malformed JSON | 400 | given / `Malformed JSON in request body` |
| `ApiError.unauthorized`, invalid/expired/revoked tokens, bad credentials or OTP | 401 | `Authentication required` / `Invalid or expired token` / `Invalid credentials` / `Invalid or expired OTP` |
| `ApiError.forbidden`, disallowed CORS origin | 403 | `You do not have permission…` / `Origin not allowed by CORS policy` |
| Unknown endpoint | 404 | `API endpoint not found` |
| `ApiError.conflict`, DB unique / foreign-key / restrict violation | 409 | Generic conflict message |
| Body over 1 MB | 413 | `Request body is too large` |
| `ApiError.validation`, DB CHECK violation | 422 | `Validation failed` + `errors[]` / generic rule message |
| Planned, not yet implemented | 501 | `This module will be implemented in a later development phase` |
| Database unreachable | 503 | `Service temporarily unavailable, please try again later` |
| Anything else | 500 | `Something went wrong` |

Database errors are recognised by their PostgreSQL SQLSTATE code or MySQL/MariaDB errno.

What the error handler protects:
- **Driver error messages are never returned or logged.** They contain the SQL statement and bound values; only the error code is logged.
- **Stack traces appear only for unexpected 5xx errors outside production.** Production responses never include stack traces, file paths, SQL or credentials.

## 11. Response format

**Success** (`utils/apiResponse.sendSuccess`):

```json
{ "success": true, "message": "Request successful", "data": {} }
```

**Error** (built by `errorHandler`). `errors` is present only when there are field-level details:

```json
{ "success": false, "message": "Something went wrong", "errors": [] }
```

**Health** uses top-level fields, as specified:

```json
{ "success": true, "message": "API is running", "version": "v1", "timestamp": "2026-10-04T06:31:06.453Z", "environment": "development" }
```

## 12. Environment variables

Read only by `config/environment.js`; template in `.env.example`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` / `production` / `test` |
| `PORT` | no | `5000` | HTTP port |
| `CORS_ORIGIN` | **production** | — | Comma-separated allowed origins; `*` is rejected in production |
| `DB_CLIENT` | no | `postgres` | `postgres` or `mysql` (also MariaDB) |
| `DATABASE_URL` | one of these two | — | Connection string (overrides `DB_*`) |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | one of these two | — | Individual settings |
| `DB_POOL_MIN` / `DB_POOL_MAX` | no | `0` / `10` | Pool size |
| `DB_TEST_DATABASE` | no | `<DB_DATABASE>_test` | Used by `npm run test:db` |
| `TRUST_PROXY` | no | off | Hop count/subnet of a reverse proxy so rate limits see client IPs |
| `JWT_SECRET` | **production** | — | Access-token signing key (32+ random chars) |
| `JWT_EXPIRES_IN` | no | `1d` | Access-token lifetime |
| `OTP_SECRET` | **production** | — | HMAC key for stored OTP hashes (32+ random chars) |
| `OTP_LENGTH`, `OTP_EXPIRY_MINUTES`, `OTP_MAX_ATTEMPTS` | no | `6`, `5`, `5` | OTP rules |
| `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_SENDS_PER_HOUR` | no | `60`, `5` | OTP resend limits |
| `OTP_PROVIDER` | **production** (not `dev`) | `dev` | OTP delivery provider |
| `LOGIN_VERIFICATION_EXPIRY_MINUTES`, `LOGIN_VERIFICATION_MAX_ATTEMPTS` | no | `5`, `5` | Live verification session |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES`, `AUTH_RATE_LIMIT_MAX`, `AUTH_FAILED_ATTEMPTS_MAX` | no | `15`, `100`, `10` | Rate limits |
| `DEFAULT_COUNTRY_CODE` | no | `+91` | Prefix for 10-digit mobile numbers |
| `STORAGE_PROVIDER` | no | `local` | Profile picture storage backend |
| `UPLOADS_DIR` | no | `uploads` | Folder for the local storage provider |
| `MEDIA_PUBLIC_BASE_URL` | **production** (https) | `http://localhost:<PORT>` | Public origin used in picture URLs |
| `PROFILE_IMAGE_MAX_SIZE_MB`, `PROFILE_IMAGE_MAX_DIMENSION` | no | `5`, `1024` | Upload size limit; stored image size |
| `QUIZ_QUESTIONS_FILE` | no | `src/config/quiz-questions.json` | Compatibility questionnaire (validated at startup) |

**Startup checks:** in production, `server.js` refuses to start (exit code 1) if `CORS_ORIGIN` is missing or `*`, if no database is configured, if `JWT_SECRET`/`OTP_SECRET` are missing, placeholders or shorter than 32 characters, if `OTP_PROVIDER=dev`, or if `MEDIA_PUBLIC_BASE_URL` is not an https URL.

## 13. Security baseline

- **Secrets:** they live only in `.env`, which is git-ignored. `.env.example` holds placeholders, and no credentials are hard-coded.
- **CORS:** an explicit allow-list. Disallowed browser origins are rejected before reaching any route, and `*` is refused in production.
- **Headers:** `helmet` defaults are applied and `x-powered-by` is disabled.
- **Request size:** JSON and urlencoded bodies are limited to 1 MB.
- **Errors:** responses never leak internals (see section 10).
- **Logging hygiene:**
  - The access log omits query strings, headers and bodies.
  - The logger redacts metadata keys matching password, secret, token, OTP, authorization, cookie, JWT, API key, message, image, photo, frame or selfie.
  - The database password is never logged.
- **Privacy by design:** login verification never handles images, and the profile photo is unrelated to verification.
- **Authentication (Phase 4):** scrypt password hashing, HMAC-hashed OTPs with expiry/attempt/resend limits, live presence verification before any access token, revocable JWT sessions, role-based authorization and rate limiting — see [authentication-flow.md](authentication-flow.md#11-security-rules).
- **Proxies:** set `TRUST_PROXY` when running behind a load balancer so rate limits see real client IPs.

## 14. Future modules

| Phase | Builds on |
| --- | --- |
| 4 — Registration, OTP, login & authorization | ✅ Done: `authService`, `otpService`, `sessionService`, `verificationService`, `requireAuth` / `requireRole` |
| 5 — Profiles & profile picture | ✅ Done: `profileService`, `profilePhotoService`, `storage/`, `uploadMiddleware` |
| 6 — Preferences, hobbies & quiz | ✅ Done: `preferenceService`, `hobbyService`, `quizService`, `quizQuestionBank` |
| Matching & recommendation | `matchingService` → `matches`; `recommendationService` + `activity_feedback` |
| Connections, chat & video | `connectionService`, `messageService`, then Socket.IO / WebRTC signalling |
| Privacy, block & report | `blockService`, `reportService` |
| Admin panel | `adminRoutes` + `adminService` behind `requireRole('admin')` |

For each module, implementing it means:
1. Replace the placeholder functions in its service and controller.
2. Add validation schemas.
3. Add model queries.

Routes, middleware and error handling stay as they are.

## 15. Testing

| Command | What it checks |
| --- | --- |
| `npm test` | Unit and API tests, no database needed. Covers: health, versioning, 404, every placeholder endpoint (501), validation (422), malformed and oversized bodies, CORS (allowed, preflight, blocked, `*`), response format, the error handler (all status mappings, DB error translation, production hiding), environment loading and production checks, logger redaction, architecture rules, and the real `server.js` starting up |
| `npm run test:db` | Against a real database: connection module, models mapped to tables, enum constants matching the CHECK constraints, and the full Phase 2 schema suite |
| Postman / Newman | `docs/postman/matchmaking-platform.postman_collection.json` — 61 requests, 122 assertions covering authentication, profiles and preferences (needs `OTP_PROVIDER=dev`; run with `--working-dir docs/postman` for the upload files). Run with `npx newman run docs/postman/matchmaking-platform.postman_collection.json` while the server is running |
