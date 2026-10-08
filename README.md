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
| Database           | PostgreSQL **or** MySQL/MariaDB via Knex (selected with `DB_CLIENT`) |
| Authentication     | Password (scrypt) or OTP, live face-presence check (MediaPipe, in browser), JWT sessions with server-side revocation |
| Real-time          | Socket.IO / WebSocket *(later phase)*                         |
| Video              | WebRTC *(later phase)*                                        |
| Recommendation     | Separate backend service/module *(later phase)*               |
| Security           | Helmet, CORS allow-list, env-based secrets, log redaction     |
| Validation         | zod (request schemas)                                         |
| Testing            | Jest + Supertest (backend), Vitest + Testing Library (frontend), Postman/Newman, browser |
| Version control    | Git + GitHub                                                  |

## 3. Architecture

```
React frontend (User panel + Admin panel)
        │  HTTP (REST, /api/v1)
        ▼
Express middleware                   (helmet, CORS, logging, body parsing)
        ▼
Routes → validators → controllers    (HTTP only)
        ▼
Services                             (business logic: auth, verification, matching, recommendation, …)
        ▼
Models / Knex                        (data access, one model per table)
        ▼
PostgreSQL or MySQL/MariaDB
```

React components contain only presentation logic, and all API access goes through `frontend/src/services`.

Matching and recommendation logic lives only in backend services. Login presence verification (`verificationService`) is separate from profile pictures (`profileService`).

The full backend design is in **[backend/docs/api-architecture.md](backend/docs/api-architecture.md)**.

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
| `JWT_SECRET` / `OTP_SECRET` | Token signing / OTP hashing secrets. Random, 32+ characters (required in production) | |
| `JWT_EXPIRES_IN` | Access-token lifetime | `1d` |
| `OTP_LENGTH`, `OTP_EXPIRY_MINUTES`, `OTP_MAX_ATTEMPTS` | OTP rules | `6`, `5`, `5` |
| `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_SENDS_PER_HOUR` | OTP resend limits | `60`, `5` |
| `OTP_PROVIDER` | `dev` = development outbox (refused in production) | `dev` |
| `LOGIN_VERIFICATION_EXPIRY_MINUTES`, `LOGIN_VERIFICATION_MAX_ATTEMPTS` | Live verification session | `5`, `5` |
| `AUTH_RATE_LIMIT_*`, `AUTH_FAILED_ATTEMPTS_MAX` | Rate limits | see `.env.example` |
| `DEFAULT_COUNTRY_CODE`, `TRUST_PROXY` | Mobile prefix; reverse-proxy hops | `+91`, off |
| `STORAGE_PROVIDER`, `UPLOADS_DIR` | Profile picture storage (`local` = disk, served at `/media`) | `local`, `uploads` |
| `MEDIA_PUBLIC_BASE_URL` | Public origin for picture URLs (https in production) | `http://localhost:5000` |
| `PROFILE_IMAGE_MAX_SIZE_MB`, `PROFILE_IMAGE_MAX_DIMENSION` | Upload limit; stored image size | `5`, `1024` |
| `QUIZ_QUESTIONS_FILE` | Compatibility questionnaire file (sample questions until approved) | `src/config/quiz-questions.json` |

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

The schema, ER diagram, delete policy and design decisions are documented in **[backend/docs/database-schema.md](backend/docs/database-schema.md)**.

## 9. Running the backend

```bash
cd backend
npm run dev     # development, auto-restart
npm start       # plain start
npm test        # unit tests (no database needed)
npm run test:db # schema integration tests (needs a database server)
```

Database scripts: `db:create`, `db:migrate`, `db:status`, `db:rollback`, `db:rollback:all`, `db:seed`, `db:reset`. See [backend/docs/database-schema.md](backend/docs/database-schema.md#9-migration-commands).

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
  "message": "API is running",
  "version": "v1",
  "timestamp": "2026-10-04T06:31:06.453Z",
  "environment": "development"
}
```

```bash
curl http://localhost:5000/api/v1/health
```

### API structure

All endpoints are versioned under `/api/v1`. Responses use one envelope:

```json
{ "success": true,  "message": "Request successful", "data": {} }
{ "success": false, "message": "Something went wrong", "errors": [] }
```

| Route group | Status |
| --- | --- |
| `/api/v1/health` | Implemented (public) |
| `/api/v1/auth` | **Implemented (Phase 4)** — register, OTP, password/OTP login, live verification, logout, `/me` |
| `/api/v1/admin/login` | Implemented (admins only, followed by live verification) |
| `/api/v1/profile` | **Implemented (Phase 5)** — create, view, edit own profile; upload/replace/remove profile picture (Bearer token) |
| `/api/v1/preferences`, `/api/v1/hobbies` | **Implemented (Phase 6)** — matching preferences, hobby catalogue and selection, compatibility quiz answers (Bearer token) |
| `/matches`, `/recommendations`, `/connections`, `/messages`, `/reports`, `/blocks`, `/feedback` | Require a Bearer token; endpoints return `501 This module will be implemented in a later development phase` |
| `/admin/*` | Require an **admin** token; `501` placeholders |
| Anything else | `404 API endpoint not found` |

The endpoint list, error codes and middleware are documented in [backend/docs/api-architecture.md](backend/docs/api-architecture.md). Registration, OTP, login, live verification and sessions are described in **[backend/docs/authentication-flow.md](backend/docs/authentication-flow.md)**; profiles and profile pictures in **[backend/docs/profile-management.md](backend/docs/profile-management.md)**; preferences, hobbies and quiz in **[backend/docs/preferences.md](backend/docs/preferences.md)**.

### Trying the login flow locally

1. Start the backend (`npm run dev`) and frontend (`npm run dev`), then open http://localhost:5173/register.
2. Register. With `OTP_PROVIDER=dev` the code is not emailed; use **Show development OTP** on the verification page (or `GET /api/v1/dev/otp?destination=<email>`).
3. Log in. The browser asks for camera permission; take a photo with exactly one face visible. Login completes only after this step.
4. For the admin panel, promote a registered account with `npm run admin:promote -- <email>` (in `backend/`), then use http://localhost:5173/admin/login.

5. After login, open **Profile** to complete your profile and add a picture from your gallery, files or camera (any image — it does not need a face).
6. Open **Preferences** to set what you are looking for, choose your hobbies and answer the (sample) compatibility quiz.

**Profile Picture and Login Verification Photo are independent features.** The verification photo is checked in the browser for face presence only and never leaves the device; the profile picture is uploaded, stored and displayed, and is never compared with anything.

A Postman collection (61 requests, 122 assertions — authentication, profiles and preferences) is at `backend/docs/postman/matchmaking-platform.postman_collection.json`. Run it from the `backend` folder while the server is running:

```bash
npx newman run docs/postman/matchmaking-platform.postman_collection.json --working-dir docs/postman
```

## 12. Project structure

```
project/
├── backend/
│   ├── src/
│   ├── src/
│   │   ├── config/          environment.js, database.js, cors.js
│   │   ├── constants/       api.js, httpStatus.js, messages.js, enums.js
│   │   ├── controllers/     health + 12 module controllers
│   │   ├── db/
│   │   │   ├── migrations/  14 schema migrations
│   │   │   ├── seeds/       01_hobbies.js
│   │   │   └── schemaHelpers.js
│   │   ├── middleware/      errorHandler.js, notFound.js, requestLogger.js
│   │   ├── models/          BaseModel + 13 table models
│   │   ├── routes/          health + 12 module route files
│   │   ├── services/        health + 13 module services (incl. matching, recommendation, verification)
│   │   ├── utils/           ApiError, apiResponse, dbErrors, logger, notImplemented
│   │   ├── validators/      commonValidator + auth/profile/preference validators
│   │   ├── app.js
│   │   └── routes.js        /api/v1 route registry
│   ├── docs/
│   │   ├── api-architecture.md
│   │   ├── authentication-flow.md
│   │   ├── profile-management.md
│   │   ├── preferences.md
│   │   ├── database-schema.md
│   │   └── postman/
│   ├── scripts/             db-create.js, db-reset.js
│   ├── tests/               unit/API tests + integration/ (database)
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
├── .gitignore
└── README.md
```

## 13. Current development phase

**Phase 7: Compatibility Engine & Adaptive ML Recommendation Pipeline (complete)**

| Phase | Scope                                           | Status      |
| ----- | ----------------------------------------------- | ----------- |
| 1     | Project setup                                   | ✅ Complete |
| 2     | Database schema and relationships               | ✅ Complete |
| 3     | Backend project and API structure (base REST API) | ✅ Complete |
| 4     | Registration, OTP, login, live verification & authorization | ✅ Complete |
| 5     | Profile creation, edit, view & profile picture  | ✅ Complete |
| 6     | Preferences, hobbies & quiz answers             | ✅ Complete |
| 7     | Phase 7: Compatibility Engine, Interaction Tracking, Logistic Regression ML Engine & Adaptive Ranking | ✅ Complete |
| 8+    | Messaging/Chat, WebRTC Video, Admin moderation & Notifications | Planned |

