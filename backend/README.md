# Backend — Matchmaking Platform API

Node.js + Express 5 REST API (base API, Phase 3; authentication, Phase 4; profiles, Phase 5; preferences, Phase 6). See the [root README](../README.md) for the project overview.

The full architecture is in **[docs/api-architecture.md](docs/api-architecture.md)**, authentication in **[docs/authentication-flow.md](docs/authentication-flow.md)**, profiles in **[docs/profile-management.md](docs/profile-management.md)**, preferences in **[docs/preferences.md](docs/preferences.md)** and the schema in **[docs/database-schema.md](docs/database-schema.md)**.

## Setup

```bash
cd backend
npm install
cp .env.example .env     # then edit values (see "Environment" below)
```

## Run

```bash
npm run dev              # development: auto-restarts on file changes
npm start                # plain start
```

The API listens on `PORT` (default `5000`). Every route is under `/api/v1`.

```bash
curl http://localhost:5000/api/v1/health
# {"success":true,"message":"API is running","version":"v1","timestamp":"…","environment":"development"}
```

## Environment

Settings are read only by `src/config/environment.js`, from `.env`. `.env` is git-ignored; `.env.example` is the template.

| Variable | Notes |
| --- | --- |
| `NODE_ENV`, `PORT` | `development` and `5000` by default |
| `CORS_ORIGIN` | Comma-separated allowed origins. **Required in production, where `*` is refused** |
| `DB_CLIENT` | `postgres` or `mysql` (also used for MariaDB) |
| `DATABASE_URL` **or** `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Database connection. **Required in production** |
| `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_TEST_DATABASE` | Optional |
| `JWT_SECRET`, `OTP_SECRET` | Random 32+ character secrets. **Required in production**; outside production a temporary secret is generated if missing |
| `JWT_EXPIRES_IN`, `OTP_*`, `LOGIN_VERIFICATION_*`, `AUTH_RATE_LIMIT_*`, `AUTH_FAILED_ATTEMPTS_MAX`, `DEFAULT_COUNTRY_CODE`, `TRUST_PROXY` | Authentication settings — see `.env.example` |
| `OTP_PROVIDER` | `dev` keeps codes in a development outbox (`GET /api/v1/dev/otp`). **Production requires a real provider** |
| `STORAGE_PROVIDER`, `UPLOADS_DIR`, `MEDIA_PUBLIC_BASE_URL`, `PROFILE_IMAGE_MAX_SIZE_MB`, `PROFILE_IMAGE_MAX_DIMENSION` | Profile picture storage and limits. `MEDIA_PUBLIC_BASE_URL` must be https in production |
| `QUIZ_QUESTIONS_FILE` | Compatibility questionnaire (validated at startup; bundled file = sample questions) |

In production the server exits on startup if the required settings are missing or unsafe.

## Database connection

`src/config/database.js` is the single place that connects to the database:
- one lazily created, pooled Knex instance (`getDb()`);
- credentials read from env only, never logged;
- a `SELECT 1` check at startup. If it fails, the server logs a warning and keeps running.

Fresh setup:

```bash
npm run db:create && npm run db:migrate && npm run db:seed
```

Schema changes always go through a **new** migration in `src/db/migrations`. Never edit a migration that has already run.

## Scripts

| Script | Description |
| --- | --- |
| `npm start` | Start the server |
| `npm run dev` | Start with `node --watch` (auto-restart) |
| `npm test` | Unit + API tests (no database needed) |
| `npm run test:db` | Database integration tests against `DB_TEST_DATABASE` |
| `npm run db:create` | Create `DB_DATABASE` if it does not exist |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:status` | List completed / pending migrations |
| `npm run db:rollback` / `db:rollback:all` | Undo the last batch / every migration |
| `npm run db:seed` | Run seeds (reference hobbies) |
| `npm run db:reset` | Rollback all + migrate + seed (refused in production) |
| `npm run admin:promote -- <email or mobile>` | Give an existing, active account the admin role |

Postman: import `docs/postman/matchmaking-platform.postman_collection.json` (upload requests use the files in `docs/postman/assets/`), or run `npx newman run docs/postman/matchmaking-platform.postman_collection.json --working-dir docs/postman` while the server is running.

## API structure

```
src/
├── config/        environment.js, database.js, cors.js
├── constants/     api, httpStatus, messages, enums
├── routes.js      mounts every route group under /api/v1
├── routes/        one file per module (authRoutes.js, profileRoutes.js, …)
├── validators/    validate() middleware (zod) + module schemas
├── controllers/   HTTP only — no business logic, no database access
├── services/      business logic (matchingService, recommendationService,
│                  verificationService, profileService, …)
├── models/        one model per table (BaseModel)
├── middleware/    requestLogger, notFound, errorHandler
├── utils/         ApiError, apiResponse, dbErrors, logger, notImplemented
├── db/            migrations, seeds
└── app.js         Express app (no listener — importable by tests)
```

| Route group | Phase 3 behaviour |
| --- | --- |
| `GET /api/v1/health` | Implemented |
| `/api/v1/auth/*` | **Implemented**: `register`, `send-otp`, `verify-otp`, `login`, `login/send-otp`, `login/verify-otp`, `login-verification/complete`, `logout`, `me` |
| `/api/v1/admin/login` | **Implemented** (admin accounts; live verification follows) |
| `/api/v1/profile` | **Implemented**: `GET`, `POST`, `PUT /`, `PUT /photo` (multipart `photo`), `DELETE /photo` — own profile only |
| `/api/v1/preferences`, `/api/v1/hobbies` | **Implemented**: preferences (`GET`/`POST`/`PUT`, one transaction with hobbies + quiz), `/options`, `/hobbies`, `/quiz`; hobby catalogue |
| `/matches`, `/recommendations`, `/connections`, `/messages`, `/reports`, `/blocks`, `/feedback` | Bearer token required → **501** placeholders |
| `/api/v1/admin/*` | Admin token required → **501** placeholders |
| Unknown paths | **404** `API endpoint not found` |

### Response format

```json
{ "success": true,  "message": "Request successful", "data": {} }
{ "success": false, "message": "Validation failed", "errors": [{ "field": "params.userId", "message": "…" }] }
```

### Errors

- Throw `ApiError.*` from any layer: `badRequest` (400), `unauthorized` (401), `forbidden` (403), `notFound` (404), `conflict` (409), `validation` (422), `notImplemented` (501).
- `middleware/errorHandler.js` formats every response. It also maps database errors to safe 409, 422 or 503 responses.
- Production responses never include stack traces, SQL, file paths or credentials.
