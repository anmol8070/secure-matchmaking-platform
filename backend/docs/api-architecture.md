# API Architecture

Backend architecture of the Secure Social Networking and Digital Matchmaking Platform, as set up in Phase 3 (base REST API). For the database design see [database-schema.md](database-schema.md).

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

| Prefix | Planned endpoints (Phase 3: all return 501 except health) |
| --- | --- |
| `/health` | `GET /` — **implemented** |
| `/auth` | `POST /register`, `POST /otp/send`, `POST /otp/verify`, `POST /login`, `POST /login/verification` (live presence result), `POST /logout`, `GET /me` |
| `/profile` | `GET /`, `POST /`, `PUT /`, `PUT /photo`, `DELETE /photo`, `GET /:userId` |
| `/preferences` | `GET /`, `PUT /` |
| `/hobbies` | `GET /`, `GET /me`, `PUT /me` |
| `/matches` | `GET /`, `GET /:userId` |
| `/recommendations` | `GET /` |
| `/connections` | `GET /`, `GET /requests`, `POST /requests`, `PATCH /requests/:requestId` |
| `/messages` | `GET /conversations`, `GET /:userId`, `POST /:userId`, `PATCH /:userId/read` |
| `/reports` | `POST /`, `GET /` |
| `/blocks` | `GET /`, `POST /`, `DELETE /:userId` |
| `/feedback` | `POST /`, `GET /` |
| `/admin` | `POST /login`, `GET /dashboard`, `GET /users`, `GET /users/:userId`, `PATCH /users/:userId/status`, `GET /reports`, `PATCH /reports/:reportId`, `GET /activity`, `GET /monitoring` |

Planned endpoints return **HTTP 501**:

```json
{ "success": false, "message": "This module will be implemented in a later development phase" }
```

Paths that are not planned return 404, even inside a module (for example `GET /api/v1/auth/unknown`).

Path parameters such as `:userId` are already validated (positive integer → otherwise 422) before the 501.

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

Authentication (`requireAuth`) and authorization (`requireRole('admin')`) middleware will be added in Phase 4. Rate limiting for OTP and login endpoints will be added at the same time.

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
| `ApiError.unauthorized`, JWT errors (Phase 4) | 401 | `Authentication required` / `Invalid or expired token` |
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
| `JWT_SECRET` | from Phase 4 | — | Token signing secret |
| `OTP_EXPIRY_MINUTES` | from Phase 4 | `10` | OTP validity |

**Startup checks:** in production, `server.js` refuses to start (exit code 1) if `CORS_ORIGIN` is missing or `*`, or if no database is configured.

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
- **Deferred to Phase 4:** authentication, authorization, rate limiting, and stricter `helmet` settings for production behind a proxy (`trust proxy`).

## 14. Future modules

| Phase | Builds on |
| --- | --- |
| 4 — Registration, OTP, login & authorization | `authRoutes`, `authService`, `authValidator`, `users`, `requireAuth` / `requireRole` middleware |
| Live presence verification | `POST /auth/login/verification`, `verificationService`, `login_verifications` |
| Profiles & profile picture | `profileRoutes`, `profileService`, multipart upload middleware |
| Preferences & hobbies | `preferenceService`, `hobbyService` |
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
| Postman / Newman | `docs/postman/matchmaking-platform.postman_collection.json` — 20 requests, 42 assertions. Run with `npx newman run docs/postman/matchmaking-platform.postman_collection.json` while the server is running |
