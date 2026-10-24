# Phase 20 — Release verification

Date: 24 October 2026. Development checkout. Database client: MySQL. Nothing was deployed.

Phase 19 results are historical. Every status below is from a command run on this date.

## Defects fixed before the final runs

- `blockService.blockUser` passed an undeclared `reason` into the model, so `POST /api/v1/blocks` returned 500. The service now accepts the reason the controller already sends.
- The profile integration test expected two signed photo URLs to be identical. Each response mints a new expiry, so the assertion now compares the file path.
- The public-photo integration test requested the path without its signature and expected 200. It now requires the signature. A new test covers anonymous refusal, members, owner, admin, connections, blocks, expiry, tampering, a privacy change after signing, and deletion.
- The schema test expected 26 migration files. The directory has 27. It now compares the applied list with that directory.
- The chat integration test omitted `reason` from the block list. The API returns `reason: null` when none was stored.
- The matches dialog test read focus in the same tick the dialog appeared. It now waits until focus is inside the dialog, then still requires Escape to close it and return focus.

## Commands

| Check | Command | Result |
| --- | --- | --- |
| Backend unit | `npx jest --testPathIgnorePatterns=/tests/integration/ --runInBand --forceExit` | PASS. 26 suites, 373 tests, exit 0. Run again after the block fix, same result. |
| Frontend | `npx vitest run` | The run that shared the machine with the backend suite failed one matches focus assertion (214 passed). After the wait, a clean run passed 15 files, 215 tests, exit 0. An earlier deep-link timeout in a parallel run did not reproduce. |
| Frontend build | `npm run build` | PASS. Vite 8.3.2, exit 0, 1.28 s. Chunks include MediaPipe vision and the Three.js hero. No face-api asset. A search of `dist` found no `face-api`, SMTP, Twilio, or TURN secret names. `HeroScene` is 549 kB. |
| Profile HTTP | `npx jest tests/integration/profile.test.js --runInBand --forceExit` | PASS. 50 tests. |
| Database suite | `npm run test:db` | 10 suites, 389 tests passed. Exit code 1. A call-socket grace timer called the database after Jest had torn the environment down (`callSocket.js` away timer). No assertion failed in that run. |
| Migrations | `npm run db:status` on the development database | 27 applied, 0 pending. Newest: `20261024120000_add_block_reason.js`. |
| Trainer | `node src/ml/scripts/train_model.js` | 7 eligible rows, 7 positive, 0 negative. No model saved. |
| Health | `GET http://127.0.0.1:5000/api/v1/health` | 200. Body contains success, message, version `v1`, timestamp, and `environment: development`. No database host or secret. |
| Production startup | Child processes with placeholder values, not the development `.env` | `OTP_PROVIDER=dev` exits 1. SMTP without credentials exits 1. `OTP_PROVIDER=production` without SMTP and Twilio exits 1. Each also reports a missing `WEBRTC_TURN_URL`. Messages did not contain credential values. |
| Backup restore | `node scripts/phase20-restore-check.js` | PASS on database `phase20_restore_check`, then dropped. 21 tables, 27 migration rows, and one synthetic user row came back with the same id and email. `mysqldump` is not on PATH, so the dump went through the MySQL driver. |
| Dependency audit | `npm audit` in `backend` and `frontend` | Backend: 11 high, 1 moderate, 0 critical. Frontend: 2 high. No upgrades were applied. |
| Browser | Dev server at `http://localhost:5173/` | Landing page, login form, and registration form loaded. The footer reported the API online. Login copy says the camera checks that one face is present. |

## Login

The presence policy is unchanged. Forged `profile_matched` values do not change a one-face login. That was covered again by the passing auth integration tests inside `npm run test:db` (the auth file is part of that suite). Zero faces, multiple faces, expiry, and replay remain in that file. The server stores `biometric_identity_verified: false` and does not keep the image.

A modified client can still report one face. The token check stops replay and use against another attempt. It does not prove what the camera saw. This is not identity recognition and it is not certified liveness detection.

## Profile photos

The HTTP test confirmed:

- Anonymous request without a signature: 401.
- Signed URL: 200.
- Tampered signature: 403.
- Expired signature: 403.
- Invalid filename: 400.
- Owner and another member when visibility is `everyone`: 200.
- `nobody`: member 403, owner 200, admin 200. The admin token was issued after the role change.
- `connections`: a non-connection is 403 and an accepted connection is 200.
- After a block, the other member is 403 even when visibility is `everyone`.
- A signature minted before the change to `nobody` still returned 200. Privacy is not revoked for an already issued signature.
- After delete, the signed URL returns 404.

## OTP and TURN

Production startup refuses `OTP_PROVIDER=dev`. SMTP and Twilio settings are required when that provider is selected. No message was sent. Delivery is BLOCKED until `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`, or `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`, are set and a send is observed. The adapters do not log the code.

`WEBRTC_TURN_URL` is empty, so ICE configuration is STUN only and `relay` is false. Production startup refuses to boot without that URL. A URL still needs `WEBRTC_TURN_SECRET` or the static username and credential, or the client receives a TURN server it cannot authenticate. No relay call was placed. TURN connectivity is BLOCKED.

## Recommendations

The compatibility formula in `matchingService.js` is unchanged: location up to 10 and age up to 15, preference items capped at 25, hobby Jaccard times 25, quiz agreement times 25, empty hobbies or a missing quiz at 12.5, total clamped to 0–100. The blend remains `0.40 × compatibility + 0.60 × probability × 100` only when an active model exists. The trainer saved none. Blocked users are excluded before scoring in `recommendationService.js`. That filter was not re-measured on a new sample.

## Dependency notes

No critical advisories. High findings that sit on the API are `multer` (request teardown), `body-parser` (compressed body), and `zod` (oversized collections). `npm audit` ties the easy fix to a major `puppeteer-core` upgrade, which was not applied. Frontend highs are `vite` 8.3.2, which affects the development server, and `undici`, pulled in by the toolchain. The production bundle does not include the Vite server. This was a package-audit plus the checks in this file, not a full penetration test.

`.env` files are git-ignored. The health response does not include secrets. CORS `*` and short signing secrets are rejected by the production validator.

## Browser walkthrough

Completed: public landing page, navbar destinations on that page, login form, registration form. The page states that sign-in checks one face and does not compare it with the profile picture.

Not completed: account registration, OTP, camera verification, profile, photo upload, preferences, recommendations, connection request, chat, video call, privacy change, block, report, and the admin journey. The IDE browser has no reliable camera, no TURN server, and completing those steps would create more development-database rows. They are NOT RUN, not passed.

## Release checklist

| Check | Status | Evidence | Remaining blocker | Next action |
| --- | --- | --- | --- | --- |
| Frontend production build | PASS | `npm run build`, exit 0 | Large hero chunk | Optional split. Not required to boot. |
| Backend production startup | PASS | Placeholder production processes exited 1 for dev OTP, missing SMTP/Twilio, and missing TURN | A real host and real values were not used | Supply them only when deploying. |
| Unit tests | PASS | Backend 373, frontend 215 | None in these suites | Keep them in the release run. |
| Integration tests | PASS with process-exit defect | 389 assertions passed, exit code 1 | Call-socket timer after Jest teardown | Clear away-timers before the test process ends. |
| Database migration | PASS | 27 applied, 0 pending on development; test database rebuilt by `test:db` | None | Run `db:migrate` on the future host. |
| Backup and restore | PASS | Isolated database, 27 ledger rows and one synthetic user restored, then dropped | `mysqldump` is not installed | Install the client used by the host before relying on this in operations. |
| Login verification | PASS | Auth cases inside the database suite | A modified client can report one face | Do not claim identity recognition. |
| Profile-photo authorization | PASS | HTTP cases listed above | Signed URLs ignore a later privacy change until they expire | Accept that 10-minute window or add revocation later. |
| OTP delivery | BLOCKED | Adapters and startup checks only | No SMTP or Twilio account | Configure one and send a code. |
| TURN configuration | PASS for the empty-development case | Startup refuses production without a URL | No server is configured | Provide URL and secret together. |
| WebRTC connectivity | BLOCKED | No relay and no call placed | TURN host | Place a call that cannot connect directly. |
| Recommendation fallback | PASS | Trainer skip, no active model required for the unit suite | Fewer than 10 labeled rows, no negative class | Collect rejections before training. |
| Security audit | PASS as a dependency scan only | `npm audit` counts above | High advisories unpatched | Review multer, body-parser, and zod patches without a major Puppeteer jump. |
| HTTPS | NOT RUN | Development is HTTP on localhost | No TLS host | Terminate HTTPS in front of the app. |
| Persistent storage | NOT RUN on a host | Local upload directories exist | A durable disk is not provisioned | Mount `UPLOADS_DIR` and `PRIVATE_UPLOADS_DIR`. |
| Monitoring | NOT RUN | Health endpoint only | No log drain or alert | Point the host at the health URL. |
| Production hosting | BLOCKED | Specification only | No provider selected | Do not treat this checkout as a release deploy. |
| Browser walkthrough | NOT RUN beyond landing, login, and register | Those three pages loaded | Camera, OTP delivery, TURN, and a second account were not exercised in the browser | Walk the signed-in journey on a machine with a camera. |

The project is not production-ready and was not deployed.
