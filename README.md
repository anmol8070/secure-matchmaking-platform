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
| Authentication     | Password (scrypt) or OTP, live camera presence check, JWT sessions with server-side revocation |
| Real-time          | Socket.IO (private chat, Phase 11; call signalling, Phase 12) on the API server |
| Video              | WebRTC peer-to-peer, signalling on the API server (Phase 12)  |
| Recommendation     | Weighted compatibility score, plus optional logistic regression (Phase 9) |
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

Matching and recommendation logic lives only in backend services. Login verification checks that one face is in the camera marker for that login attempt. The server does not compare the frame with the profile picture and does not accept a client boolean as identity evidence. If the account has no profile picture, the captured frame can be saved as that picture after sign-in.

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
- The schema is built by Knex migrations in `backend/src/db/migrations`. On 24 October 2026 the development MySQL database had all 27 migration files applied and none pending. The example environment uses PostgreSQL; this development database uses `DB_CLIENT=mysql`.

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
| `/api/v1/matches` | **Implemented (Phase 8)** — `GET /matches` ranked recommendations (pagination + filters), `GET /matches/:userId` full compatibility details (Bearer token) |
| `/api/v1/feedback` | **Implemented (Phase 7/8)** — record interaction events (`profile_view`, `interest`, `connection_request`, `connection_accepted`, `rejection`, `feedback`); list own activity |
| `/api/v1/recommendations` | Alias for `/matches` — same pipeline (Bearer token) |
| `/api/v1/connections` | **Implemented (Phase 10)** — send, accept, reject, cancel requests; list received/sent requests and connections; relationship status; remove connections (Bearer token) |
| `/api/v1/messages` + Socket.IO | **Implemented (Phase 11)** — private chat between accepted connections: text and image messages (private storage), history (cursor pagination), read receipts, conversation list; real-time delivery, typing and presence over Socket.IO on the same port (Bearer token) |
| `/api/v1/calls` + Socket.IO | **Implemented (Phase 12)** — private WebRTC video calls between accepted connections: place/accept/reject/end, signalling over Socket.IO, ICE servers (short-lived TURN credentials), call history (Bearer token) |
| `/api/v1/privacy` | **Implemented (Phase 13)** — own privacy settings (who sees photo, age, location, education, occupation, lifestyle, bio, hobbies, online status; profile visibility); enforced server-side in every API that returns profile data |
| `/api/v1/blocks` | **Implemented (Phase 13)** — block (`blockedUserId`), list, unblock; a block ends the connection and closes chats and calls immediately, in both directions |
| `/api/v1/reports` | **Implemented (Phase 13)** — report a user (validated category + optional description, duplicate-safe, rate-limited), list own reports; moderation is Phase 14 |
| `/api/v1/profile/:userId` | **Implemented (Phase 13)** — another member's profile, filtered by their privacy settings |
| `/api/v1/admin/*` | **Implemented (Phase 14)** — admin role required on every route (checked from the database per request): dashboard statistics, activity series, platform health, ML monitoring, user search/suspend/reactivate, report review, read-only audit log |
| Anything else | `404 API endpoint not found` |

The endpoint list, error codes and middleware are documented in [backend/docs/api-architecture.md](backend/docs/api-architecture.md). Registration, OTP, login, live verification and sessions are described in **[backend/docs/authentication-flow.md](backend/docs/authentication-flow.md)**; profiles and profile pictures in **[backend/docs/profile-management.md](backend/docs/profile-management.md)**; preferences, hobbies and quiz in **[backend/docs/preferences.md](backend/docs/preferences.md)**; Phase 8 match ranking and recommendations in **[backend/docs/phase-8-matches.md](backend/docs/phase-8-matches.md)**; Phase 10 connection requests and connections in **[backend/docs/phase-10-connections.md](backend/docs/phase-10-connections.md)**; Phase 11 private chat, REST API and Socket.IO events in **[backend/docs/phase-11-chat.md](backend/docs/phase-11-chat.md)**; Phase 12 video calls (WebRTC architecture, signalling flow, call lifecycle, STUN/TURN, HTTPS, REST + socket events, testing) in **[backend/docs/phase-12-video-calls.md](backend/docs/phase-12-video-calls.md)**; Phase 13 privacy settings, blocking and reporting in **[backend/docs/phase-13-privacy-safety.md](backend/docs/phase-13-privacy-safety.md)**; Phase 14 admin panel (authorization, user management, moderation, audit log, dashboard metrics, ML monitoring) in **[backend/docs/phase-14-admin.md](backend/docs/phase-14-admin.md)**.

### Admin access (Phase 14)

There is no default admin and no admin sign-up. Register and verify a normal account, then on the server run `npm run admin:promote -- <email or mobile>` in `backend/`. Sign in at `/admin/login` (credentials + live verification). Every `/api/v1/admin/*` route checks the admin role and account status in the database on each request; ordinary users get 403.

### Video calls in short (Phase 12)

* Media is **peer-to-peer WebRTC**; the API never sees audio/video and nothing is recorded. It authorizes calls (accepted connection, no block, active accounts), relays signalling over the existing Socket.IO server to the two participants only, and stores call metadata in `video_calls`.
* Configure ICE servers with `WEBRTC_STUN_URL`, `WEBRTC_TURN_URL` and preferably `WEBRTC_TURN_SECRET` (short-lived TURN credentials minted by the API). **Production needs a TURN relay** (STUN alone fails on many networks) and **HTTPS/WSS** (browsers only allow camera/microphone on secure pages; `localhost` is fine for development).
* Call timing: `CALL_RING_TIMEOUT_SECONDS`, `CALL_CONNECT_TIMEOUT_SECONDS`, `CALL_REJOIN_GRACE_SECONDS` (see `backend/.env.example`).
* Local two-browser test: `npm run e2e:video` in `backend/` (instructions in the Phase 12 doc).

### Trying the login flow locally

1. Start the backend (`npm run dev`) and frontend (`npm run dev`), then open http://localhost:5173/register.
2. Register. With `OTP_PROVIDER=dev` the code is not emailed; use **Show development OTP** on the verification page (or `GET /api/v1/dev/otp?destination=<email>`).
3. Log in. The browser asks for camera permission. Centre one face in the on-screen marker; the photo is taken automatically. The check is presence for that login attempt. It does not compare the face with a profile picture. If the account has no profile picture, the frame is kept and uploaded once a profile exists.
4. For the admin panel, promote a registered account with `npm run admin:promote -- <email>` (in `backend/`), then use http://localhost:5173/admin/login.

5. After login, open **Profile** to complete your profile and add a picture from your gallery, files or camera (any image — it does not need a face).
6. Open **Preferences** to set what you are looking for, choose your hobbies and answer the (sample) compatibility quiz.

**Profile picture and login verification are different steps.** The profile picture is an uploaded image. API responses hand the browser a short-lived signed URL. An unsigned request is not public: "everyone" means signed-in members, and tighter settings follow the privacy row. Login verification is a camera presence check bound to a single-use token. The image is not uploaded as proof of identity.

Phase 19 remediation is in **[docs/phase-19/README.md](docs/phase-19/README.md)**. The 24 October 2026 release check is in **[docs/phase-20/README.md](docs/phase-20/README.md)**.

The Phase 18 audit is in **[docs/phase-18/README.md](docs/phase-18/README.md)**. Phase 19 changes are recorded separately so that audit stays a historical record.

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

**Phase 14: Admin Dashboard, User Management, Report Moderation & Monitoring (complete)**

| Phase | Scope                                           | Status      |
| ----- | ----------------------------------------------- | ----------- |
| 1     | Project setup                                   | ✅ Complete |
| 2     | Database schema and relationships               | ✅ Complete |
| 3     | Backend project and API structure (base REST API) | ✅ Complete |
| 4     | Registration, OTP, login, live verification & authorization | ✅ Complete |
| 5     | Profile creation, edit, view & profile picture  | ✅ Complete |
| 6     | Preferences, hobbies & quiz answers             | ✅ Complete |
| 7     | Compatibility Engine, Interaction Tracking, Logistic Regression ML Engine & Adaptive Ranking | ✅ Complete |
| 8     | Match Ranking & Recommended Profiles (deterministic pipeline, GET /matches, Phase 9 ML preparation) | ✅ Complete |
| 9     | ML-based Adaptive Recommendation System (Logistic Regression, evaluation, inference) | ✅ Complete |
| 10    | Connection requests & connection management (lifecycle, blocking, interaction logging, chat precondition) | ✅ Complete |
| 11    | Private chat / real-time messaging (Socket.IO, persistence, receipts, typing, presence) | ✅ Complete |
| 12    | Private video calls (WebRTC, Socket.IO signalling, STUN/TURN, call history) | ✅ Complete |
| 13    | Privacy settings, blocking & user reporting (server-side privacy filtering, block enforcement across chat/video/recommendations, reports) | ✅ Complete |
| 14    | Admin dashboard, user management, report moderation, audit log, activity & ML monitoring | ✅ Complete |
| 15+   | Frontend integration, responsive UI & end-to-end UX refinement | Planned |

