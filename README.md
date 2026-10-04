# Secure Social Networking and Digital Matchmaking Platform

## 1. Purpose

A secure platform where people can build social connections and find compatible matches. It has two panels:

- **User panel:** registration with OTP verification, profiles, preferences, match recommendations, connection requests, chat and video calling.
- **Admin panel:** user management, moderation of reports and blocks, and platform oversight.

The matching and recommendation logic is kept independent of the frontend, so scoring can change without touching the React UI.

## 2. Technology stack

| Area               | Technology                                                    |
| ------------------ | ------------------------------------------------------------- |
| Frontend           | React 19, React Router 7, Vite, JavaScript, HTML, CSS         |
| Backend            | Node.js, Express 5, REST APIs                                 |
| Database           | PostgreSQL **or** MySQL via Knex (selected with `DB_CLIENT`)  |
| Authentication     | OTP + JWT/session *(Phase 3)*                                 |
| Real-time          | Socket.IO / WebSocket *(later phase)*                         |
| Video              | WebRTC *(later phase)*                                        |
| Recommendation     | Separate backend service/module *(later phase)*               |
| Security           | Helmet, CORS allow-list, env-based secrets                    |
| Testing            | Jest + Supertest (backend), Vitest + Testing Library (frontend), Postman, browser |
| Version control    | Git + GitHub                                                  |

## 3. Architecture

```
React frontend (User panel + Admin panel)
        │  HTTP (REST, /api/v1)
        ▼
Express routes → controllers         (HTTP only)
        ▼
Services                             (business logic, incl. future matching engine)
        ▼
Models / Knex                        (data access)
        ▼
PostgreSQL or MySQL
```

React components contain only presentation logic. All API access goes through `frontend/src/services`.

## 4. Prerequisites

- Node.js 18+ (developed on Node 24) and npm
- PostgreSQL 12+ (recommended), MySQL 8.0.16+, or MariaDB 10.4+. The API starts without a database and logs a warning, but migrations and the schema tests need one.

## 5. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

## 6. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

## 7. Environment configuration

`.env` files are git-ignored. Only the `.env.example` templates are committed.

**`backend/.env`**

| Variable        | Description                                                     | Example                   |
| --------------- | --------------------------------------------------------------- | ------------------------- |
| `NODE_ENV`      | `development`, `production` or `test`                           | `development`             |
| `PORT`          | API port                                                        | `5000`                    |
| `CORS_ORIGIN`   | Comma-separated allowed browser origins                         | `http://localhost:5173`   |
| `DB_CLIENT`     | `postgres` or `mysql`                                           | `postgres`                |
| `DATABASE_URL`  | Optional connection string. If set, it overrides the `DB_*` settings. | `postgres://u:p@localhost:5432/matchmaking_db` |
| `DB_HOST`       | Database host                                                   | `localhost`               |
| `DB_PORT`       | Database port (defaults to 5432 / 3306 by client)               | `5432`                    |
| `DB_DATABASE`   | Database name                                                   | `matchmaking_db`          |
| `DB_USERNAME`   | Database user                                                   |                           |
| `DB_PASSWORD`   | Database password                                               |                           |
| `DB_POOL_MIN` / `DB_POOL_MAX` | Connection pool size                              | `0` / `10`                |
| `DB_TEST_DATABASE` | Database for `npm run test:db`. Its tables are rebuilt on every run. | `matchmaking_db_test` (default: `<DB_DATABASE>_test`) |
| `JWT_SECRET`    | Token signing secret, used from Phase 3. Use a long random value. |                         |

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**`frontend/.env`**

| Variable            | Description          | Example                         |
| ------------------- | -------------------- | ------------------------------- |
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:5000/api/v1`  |

Anything in `frontend/.env` is shipped to the browser. Never put secrets there.

## 8. Database configuration

The connection layer is in `backend/src/config/database.js`:

- Set `DB_CLIENT=postgres` or `DB_CLIENT=mysql` (`mysql` also covers MariaDB). Both drivers (`pg`, `mysql2`) are installed, so switching engines needs no code changes.
- Credentials are read only from environment variables.
- On startup the server runs `SELECT 1` and logs whether the connection succeeded.
- The schema (13 tables) is built by Knex migrations in `backend/src/db/migrations`.

To set up a fresh database:

```bash
cd backend
npm run db:create    # creates DB_DATABASE if missing
npm run db:migrate   # creates all tables, foreign keys and indexes
npm run db:seed      # reference hobbies only
npm run db:status    # shows applied / pending migrations
```

The schema, ER diagram, delete policy and design decisions are documented in **[docs/database-schema.md](docs/database-schema.md)**.

## 9. Running the backend

```bash
cd backend
npm run dev     # development, auto-restart
npm start       # plain start
npm test        # unit tests (no database needed)
npm run test:db # schema integration tests (needs a database server)
```

Database scripts: `db:create`, `db:migrate`, `db:status`, `db:rollback`, `db:rollback:all`, `db:seed`, `db:reset`. See [docs/database-schema.md](docs/database-schema.md#9-migration-commands).

## 10. Running the frontend

```bash
cd frontend
npm run dev     # http://localhost:5173
npm run build   # production build
npm test        # unit tests
```

## 11. Health-check API

```
GET /api/v1/health
```

```json
{
  "success": true,
  "message": "API is running"
}
```

```bash
curl http://localhost:5000/api/v1/health
```

A Postman collection is available at `docs/postman/matchmaking-platform.postman_collection.json`.

## 12. Project structure

```
project/
├── backend/
│   ├── src/
│   │   ├── config/          env.js, database.js
│   │   ├── controllers/     health.controller.js
│   │   ├── db/
│   │   │   ├── migrations/  14 schema migrations
│   │   │   ├── seeds/       01_hobbies.js
│   │   │   └── schemaHelpers.js
│   │   ├── middleware/      errorHandler.js, notFound.js, requestLogger.js
│   │   ├── models/          (Phase 3)
│   │   ├── routes/          index.js, health.routes.js
│   │   ├── services/        health.service.js
│   │   ├── utils/           ApiError.js, logger.js
│   │   ├── validators/      (Phase 3+)
│   │   └── app.js
│   ├── scripts/             db-create.js, db-reset.js
│   ├── tests/               unit tests + integration/ (database)
│   ├── knexfile.js
│   ├── server.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/common/
│   │   ├── hooks/
│   │   ├── layouts/         UserLayout.jsx, AdminLayout.jsx
│   │   ├── pages/user/      Home, Register, VerifyOtp, Login
│   │   ├── pages/admin/     AdminLogin, AdminDashboard
│   │   ├── routes/          AppRoutes.jsx, paths.js
│   │   ├── services/        apiClient.js, healthService.js
│   │   ├── styles/
│   │   ├── utils/
│   │   ├── assets/
│   │   └── App.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.example
│   └── package.json
├── docs/
│   ├── database-schema.md   schema, ER diagram, design decisions
│   └── postman/
├── .gitignore
└── README.md
```

## 13. Current development phase

**Phase 2: Database Schema and Relationships (complete)**

| Phase | Scope                                           | Status      |
| ----- | ----------------------------------------------- | ----------- |
| 1     | Project setup                                   | ✅ Complete |
| 2     | Database schema and relationships               | ✅ Complete |
| 3     | Backend project and API structure               | Next        |
| 4+    | Authentication (OTP + JWT), profiles, matching, connections, chat, video, admin, notifications | Planned |
