# Test report

Date: 24 October 2026. Status values are PASS, FAIL, BLOCKED, or NOT RUN. A PASS is recorded only for a command executed during this audit.

## Environment

- Host: Windows, project checkout `d:\project`.
- Frontend: Vitest 5, jsdom, `npm test` in `frontend`.
- Backend unit runner: Jest, `npm test` in `backend`. That script ignores `tests/integration`.
- Database client in the development `.env`: `mysql`. `npm run db:status` listed 27 completed migrations and no pending files.
- API: an existing development process answered `GET http://127.0.0.1:5000/api/v1/health` with `success: true` and `environment: development`.

## Executed tests

| ID | Objective | Preconditions | Steps | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T-BE-01 | Backend unit suite | Dependencies installed. No database required by this script. | `npm test` in `backend`. | Exit 0. | 21 suites passed, 322 tests passed, about 21 s. Jest then force-exited a worker that did not close by itself. | PASS |
| T-FE-00 | Frontend suite before repairs | Same checkout. | `npm test` in `frontend`. | Exit 0. | 12 files failed to parse, then 7 assertions failed. `ProfileCreate.jsx`, `ConnectionButton.jsx`, `SafetyActions.jsx`, and `AdminMLMonitoring.jsx` had broken JSX. Privacy selects ignored saved values. Several pages called a toast function that was not in scope, and the profile page did not show the save message. | FAIL |
| T-FE-01 | Frontend suite after those repairs | Repairs saved. | `npm test` in `frontend`. | Exit 0. | 15 files passed, 216 tests passed, about 33 s. jsdom logged that `scrollTo` is not implemented. | PASS |
| T-FE-02 | Production bundle | Same frontend. | `npm run build`. | Exit 0. | Built in about 2.5 s. Vite warned that `HeroScene` (about 549 kB) and `face-api` (about 1.3 MB) exceed 500 kB minified. | PASS |
| T-DB-01 | Migration status | Development database reachable. | `npm run db:status` in `backend`. | No pending migrations. | 27 completed, none pending, including `20261024120000_add_block_reason.js`. | PASS |
| T-API-01 | Process liveness | Development server already running. | HTTP GET `/api/v1/health`. | `success: true`. | That body, `version` `v1`, environment `development`. | PASS |

T-FE-01 includes the login verification, profile, privacy and block dialog, connections, chat, video, admin, preferences, and route tests that live under `frontend/src`. Those are component tests with a mocked API. They are not a camera or a two-browser call.

T-BE-01 includes the unit files for matching, recommendations, the logistic training helpers, auth, privacy, connections, messaging, calls, and admin. They do not replace `tests/integration`.

## Not run in this audit

| ID | Objective | Why it was not run | Status |
| --- | --- | --- | --- |
| T-DB-02 | `npm run test:db` schema and API integration | Rebuilds the dedicated test database. Left for a deliberate run. | NOT RUN |
| T-POST-01 | Newman collection in `backend/docs/postman` | Not executed. | NOT RUN |
| T-E2E-01 | `npm run e2e:video` and a manual two-account chat | Needs two browsers, camera permission, and a second person. | NOT RUN |
| T-UI-01 | Landing, themes, and six viewport widths in a browser | Not repeated after the syntax repairs. | NOT RUN |
| T-SEC-01 | Dependency audit and any penetration test | Not run. No certificate exists to cite. | NOT RUN |
| T-ML-01 | Train a model and record precision, recall, F1, or ROC-AUC | Would write a model row and invent nothing if samples are scarce. Not executed, so no metric is published. | NOT RUN |

## Repairs made so T-FE-01 could pass

These were defects found by the test run, not new features.

- Closed broken JSX in the profile create form, connection button, safety actions, and ML monitoring page.
- Bound each privacy select to the saved value.
- Called the toast helper that those pages already imported, on connection removal and preference save.
- Showed the profile-updated message carried in the navigation state.

## Release reading

The unit suites and the production frontend build passed after those repairs. Integration tests, a live demonstration, recommendation metrics, and deployment remain unverified. The project is not cleared for production by this report.

---

## Phase 19 tests (24 October 2026)

These rows are later than the Phase 18 table above. A PASS here was executed after the remediation.

| ID | Objective | Preconditions | Steps | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T19-BE | Backend unit suite | Remediation saved. | `npx jest --testPathIgnorePatterns=/tests/integration/ --runInBand --forceExit` | Exit 0. | 26 suites, 373 tests passed. | PASS |
| T19-FE | Frontend suite | Same. | `npx vitest run` | Exit 0. | 15 files, 215 tests passed. | PASS |
| T19-AUTH | Login, forged flags, expiry, replay, wrong session | Separate test database. | `npx jest tests/integration/auth.test.js --runInBand --forceExit` | Exit 0. | 51 tests passed. Forged `profile_matched` true and false both completed a one-face login. The stored result has `biometric_identity_verified: false`. | PASS |
| T19-ML | Recommendation evaluation | Development MySQL. Do not insert rows. | `node src/ml/scripts/train_model.js` | Skip when fewer than 10 labeled samples. | 7 eligible rows, 7 positive, 0 negative. Script printed the insufficient-data line and saved no model. | PASS |
| T19-OTP-LIVE | SMTP or Twilio delivery | Provider credentials. | Send a real code. | A message arrives and the code is not logged. | Credentials are not configured. | NOT RUN |
| T19-TURN-LIVE | Relay connectivity | A TURN server. | Place a call that cannot connect directly. | Media flows through TURN. | `WEBRTC_TURN_URL` is empty. | NOT RUN |
| T19-BUILD | Frontend production build after removing face-api | Remediation saved. | `npm run build` | Exit 0. | Not run in this pass. | NOT RUN |
| T19-DB | Full `npm run test:db` | Separate test database. | The integration script. | Exit 0. | Not run. Only the auth file above was run. | NOT RUN |

## Phase 20 executions (24 October 2026)

These are new runs. They do not replace the Phase 19 rows.

| ID | Command | Environment | Result | Status |
| --- | --- | --- | --- | --- |
| T20-BE | `npx jest --testPathIgnorePatterns=/tests/integration/ --runInBand --forceExit` | Development checkout, unit tests | 26 suites, 373 tests, exit 0. Repeated after the block-reason fix with the same result. | PASS |
| T20-FE | `npx vitest run` | Frontend, after the dialog focus wait | 15 files, 215 tests, exit 0 | PASS |
| T20-BUILD | `npm run build` in `frontend` | Vite 8.3.2 | Exit 0 in 1.28 s. No face-api chunk. No secret names in `dist`. | PASS |
| T20-DB | `npm run test:db` | Separate test database, MySQL | 10 suites, 389 tests passed. Process exit code 1 because a call-socket timer touched the database after Jest tore down. No assertion failed in the final run. | PASS with process-exit defect |
| T20-PHOTO | `npx jest tests/integration/profile.test.js --runInBand --forceExit` | Same test database | 50 passed, including signed URLs, visibility, blocks, and deletion | PASS |
| T20-ML | `node src/ml/scripts/train_model.js` | Development MySQL | 7 eligible, 7 positive, 0 negative, no model | PASS as a skip |
| T20-OTP-LIVE | Live SMTP or Twilio send | Credentials | Not configured | BLOCKED |
| T20-TURN | Live relay | TURN server | URL empty | BLOCKED |

