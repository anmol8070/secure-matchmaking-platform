# Backend — Matchmaking Platform API

Node.js + Express REST API. See the [root README](../README.md) for the full project overview.

## Setup

```bash
cd backend
npm install
cp .env.example .env     # then edit values
npm run dev              # auto-restarts on file changes
# or
npm start
```

The API listens on `PORT` (default `5000`). All routes are prefixed with `/api/v1`.

## Scripts

| Script        | Description                              |
| ------------- | ---------------------------------------- |
| `npm start`   | Start the server                         |
| `npm run dev` | Start with `node --watch` (auto-restart) |
| `npm test`    | Run Jest + Supertest unit tests (no database needed) |
| `npm run test:db` | Schema integration tests against `DB_TEST_DATABASE` |
| `npm run db:create` | Create `DB_DATABASE` if it does not exist |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:status` | List completed / pending migrations |
| `npm run db:rollback` | Undo the last migration batch |
| `npm run db:rollback:all` | Undo every migration |
| `npm run db:seed` | Run seeds (reference hobbies) |
| `npm run db:reset` | Rollback all + migrate + seed (refused in production) |

## Structure

```
backend/
├── src/
│   ├── config/        env.js (all env access), database.js (Knex connection layer)
│   ├── controllers/   HTTP request/response handling only
│   ├── db/            migrations/, seeds/, schemaHelpers.js (shared migration conventions)
│   ├── middleware/    requestLogger, notFound, errorHandler
│   ├── models/        Data-access models (Phase 3)
│   ├── routes/        index.js mounts feature routers under /api/v1
│   ├── services/      Business logic (matching/recommendation will live here or in a separate service)
│   ├── utils/         logger, ApiError
│   ├── validators/    Request validation (Phase 3+)
│   └── app.js         Express app (no listener — importable by tests)
├── scripts/           db-create.js, db-reset.js
├── tests/             Jest unit tests; tests/integration/ needs a database
├── knexfile.js        Knex CLI config (reads .env)
├── server.js          Process entry point
└── .env.example
```

Request flow: `route → controller → service → model/database`. Controllers stay thin; business logic belongs in services.

## Error format

All errors are returned as JSON:

```json
{ "success": false, "message": "Route not found: GET /api/v1/nope" }
```

- Throw `ApiError` (e.g. `ApiError.badRequest('...')`) for expected errors — the message is returned to the client.
- Unexpected errors return `500`. In `production` the message is replaced with `Internal server error` and no stack trace is sent. In development, 5xx responses include `stack` for debugging.

## Database

`src/config/database.js` builds a Knex instance from env vars. Set `DB_CLIENT` to `postgres` or `mysql` (also used for MariaDB); both drivers (`pg`, `mysql2`) are installed. `DATABASE_URL`, if set, takes precedence over the individual `DB_*` settings.

The server attempts a `SELECT 1` on startup and logs a warning if the database is unreachable. The API still starts so it can be developed before a database is available.

Fresh setup: `npm run db:create && npm run db:migrate && npm run db:seed`.

Schema changes always go through a **new** migration in `src/db/migrations`; never edit one that has already run. The full schema, ER diagram and delete policy are in [docs/database-schema.md](../docs/database-schema.md).
