# Backend — Matchmaking Platform API

Node.js + Express 5 REST API (base API, Phase 3). See the [root README](../README.md) for the project overview.

The full architecture is in **[docs/api-architecture.md](docs/api-architecture.md)** and the schema in **[docs/database-schema.md](docs/database-schema.md)**.

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
| `JWT_SECRET`, `OTP_EXPIRY_MINUTES` | Placeholders until Phase 4 |

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

Postman: import `docs/postman/matchmaking-platform.postman_collection.json`, or run `npx newman run docs/postman/matchmaking-platform.postman_collection.json` while the server is running.

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
| `/api/v1/auth`, `/profile`, `/preferences`, `/hobbies`, `/matches`, `/recommendations`, `/connections`, `/messages`, `/reports`, `/blocks`, `/feedback`, `/admin` | Planned endpoints return **501** `This module will be implemented in a later development phase` |
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
