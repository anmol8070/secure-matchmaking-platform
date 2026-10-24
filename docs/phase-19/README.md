# Phase 19 — Security remediation and readiness

Date: 24 October 2026. Nothing was deployed. The Phase 18 documents stay as the historical audit. Where a later paragraph in those files disagrees with this page, this page is the record of what was executed.

## 1. Blocker-to-code mapping

| Blocker | Code and endpoints | Impact | Change | Tests | External dependency | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Client-trusted `profile_matched` | `verificationService.js`, `POST /api/v1/auth/login-verification/complete`, `LoginVerification.jsx` | A modified browser could satisfy or block login with a boolean the server could not check | The boolean no longer changes the outcome. Login is the presence result for that token. | Auth integration, 51 passed, including forged true and false | None | Addressed. Not an identity check. |
| Public profile photos | `GET /media/profile-photos/:filename`, `toPublicUrl` | Anyone who knew the path could fetch the file, including when privacy said otherwise | Unsigned requests need a member session and pass photo visibility. Responses carry a 10-minute signature. | Unit tests for signature and the access decision. HTTP route not driven with a real file in this pass. | None | Addressed, with the signed-URL window below. |
| Development OTP outbox | `otpDelivery/*`, `GET /api/v1/dev/otp` | A production process could have exposed codes if `OTP_PROVIDER=dev` were left on | Production startup already rejects `dev`. SMTP and Twilio adapters read environment credentials. Production startup now also requires those credentials and a TURN URL. | `tests/otpDelivery.test.js` inside the unit suite. No live send. | SMTP host and Twilio account | Adapter only. Delivery NOT RUN. |
| No TURN server | `GET /api/v1/calls/ice-servers`, `callService.getIceServers` | Calls fail on networks that block a direct path | Credential minting was already in the API. The call page states when `relay` is false. Production refuses to start without `WEBRTC_TURN_URL`. | Existing ICE unit tests in the passing suite. No live relay. | A TURN host the operator runs | Blocked on infrastructure. |
| Unevaluated ranker | `matchingService.js`, `recommendationService.js`, `src/ml/scripts/train_model.js` | An optional blend could be described as an improvement without evidence | Formula unchanged. Trainer ran and skipped. A fixture model row written into the development database by a unit test was removed, and that test no longer writes there. | Trainer output recorded below | More labeled feedback | Evaluated as insufficient. Baseline remains. |
| No production host | No host in the repository | The app cannot be reached as a production service | Specification only | Not a runtime test | A host, TLS, database, disk, TURN, and an OTP provider | Not deployed. |

## 2. Login verification

The approved check is: one reported face, on the verification token created for that account after the password or OTP step. The token is stored as a hash, expires, and is single-use. Failed attempts are counted. The body still rejects an uploaded image.

`profile_matched: true` and `profile_matched: false` were both sent in the auth integration test with one face and a profile photo URL stored on the account. Both logins returned 200. The saved detection record sets `biometric_identity_verified` to false and does not store the flag as a match result. Missing face data, expiry, replay, and a suspended account were already covered by that same file (51 passed).

The browser no longer loads face-api for login. `@vladmandic/face-api` was removed from the frontend dependencies. The camera still looks for one face in the marker. That is not certified liveness detection. A modified client can still send `face_count: 1`.

## 3. Profile-photo policy

Photos are not a public gallery. The stable path in the database is `/media/profile-photos/<uuid>.webp`. Callers receive `?exp=&sig=` for 10 minutes. Signature checks use the same signing secret as access tokens.

Without a valid signature:

- The owner and an admin may view the file.
- A block in either direction is denied.
- `everyone` allows any other signed-in member. That is the settings label "All members", not the open internet.
- `connections` requires an accepted connection.
- `nobody` is denied to everyone else.
- No session and no signature is 401.

A valid signature is not checked again against privacy until it expires. Forwarding that URL is possible for those 10 minutes. Uploads are still limited, re-encoded to WebP, and stored under a generated name. The filename pattern rejects path traversal.

## 4. OTP

Development keeps `OTP_PROVIDER=dev` and the outbox. The code is not written to the log. Production will not start with that provider.

`OTP_PROVIDER=smtp` sends email. `twilio` sends SMS. `production` sends email through SMTP and mobile through Twilio. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `SMTP_SECURE`, or `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`. None of those were given real values, and no message was sent. The hand-rolled SMTP client was not verified against a server.

Expiry, attempt limits, resend cooldown, and rate limits are unchanged.

## 5. TURN

`WEBRTC_STUN_URL` defaults to a public STUN address. `WEBRTC_TURN_URL` is empty here, so `relay` is false and the call screen says a direct connection may fail.

When a URL and `WEBRTC_TURN_SECRET` are set, the API mints `username = <unix expiry>:<userId>` and a base64 HMAC-SHA1 credential. The secret stays on the server. TTL defaults to 3600 seconds. Static `WEBRTC_TURN_USERNAME` and `WEBRTC_TURN_CREDENTIAL` are the fallback. Signalling still requires the authenticated socket. No relay test was run.

A production TURN service needs its own host, a shared secret matching `WEBRTC_TURN_SECRET`, UDP 3478, and a relay port range. Free public TURN servers are not assumed.

## 6. Recommendation evaluation

Compatibility formula was not changed: location and age up to 25, preference items up to 25, hobby Jaccard times 25, quiz agreement times 25, clamp 0–100, empty hobbies or a missing quiz at 12.5.

The blend, when a model is active, remains `0.40 × compatibility + 0.60 × probability × 100`.

On 24 October 2026, `node src/ml/scripts/train_model.js` against the development database reported 7 eligible interactions, 7 positive, 0 negative, then stopped. No model row was written. No precision, recall, or acceptance rate is stated.

Blocked users are excluded before scoring in `recommendationService.js`. That path was not re-run as an experiment.

The Phase 9 unit test had been deleting and inserting `ml_model_versions` on the configured database. It now stubs the model lookup. The fixture row `test-v1` left in the development database was deleted so local ranking uses the compatibility score.

## 7. Production hosting specification

No provider is selected and none was purchased.

- Frontend: static build of `frontend` (`npm run build`), served over HTTPS. Set `VITE_API_BASE_URL` at build time to the API origin.
- API: Node.js 18 or newer, `npm start` in `backend`. One process unless `REDIS_URL` is set for Socket.IO. The platform must allow WebSocket upgrades on the same port.
- Database: PostgreSQL 12+ or MySQL 8.0.16+ / MariaDB 10.4+. This development database is MySQL. Run `npm run db:migrate` before traffic. Do not point the app at the test database.
- Files: persistent disk for `UPLOADS_DIR` and `PRIVATE_UPLOADS_DIR`, not an ephemeral container disk. Profile photos are served by the API, not by a public bucket.
- TLS: terminate HTTPS in front of both origins. Browsers will not open the camera or microphone on a non-local HTTP page.
- TURN and OTP: required before `NODE_ENV=production` will start, because `validateProductionReadiness` is now the production startup check.
- Health: `GET /api/v1/health`.
- Logs: existing request logger. Do not log OTP codes, passwords, or TURN secrets.
- Backups: database dumps plus the two upload directories. Restore is a new database, `db:migrate` only if the dump is a schema-less logical backup, then point `DB_*` at it. This was not rehearsed.
- Rollback: keep the previous build and the previous migration. `npm run db:rollback` reverses one migration and can drop columns. Take a backup first.

## 8. Environment variables

Secrets below are names only. Values stay in `.env`, which is git-ignored.

Backend, required in production:

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | `production` turns on the readiness checks |
| `PORT` | API listen port |
| `CORS_ORIGIN` | Frontend origin. `*` is rejected |
| `DB_CLIENT` | `postgres` or `mysql` |
| `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Database |
| `JWT_SECRET`, `OTP_SECRET` | At least 32 characters |
| `OTP_PROVIDER` | `smtp`, `twilio`, or `production`. Not `dev` |
| `MEDIA_PUBLIC_BASE_URL` | `https` origin that serves `/media` |
| `WEBRTC_TURN_URL` | TURN server list |
| SMTP or Twilio variables | Whichever the OTP provider needs |

Backend, optional:

`JWT_EXPIRES_IN`, OTP length and limits, `LOGIN_VERIFICATION_*`, auth rate limits, `TRUST_PROXY`, `STORAGE_PROVIDER`, `UPLOADS_DIR`, `PRIVATE_UPLOADS_DIR`, image size limits, quiz file, recommendation and message and call limits, `WEBRTC_STUN_URL`, `WEBRTC_TURN_SECRET`, `WEBRTC_TURN_TTL_SECONDS`, static TURN username and credential, `REDIS_URL`, admin and report limits, `DB_TEST_DATABASE`.

Frontend, build-time, no secrets:

`VITE_API_BASE_URL`, optional MediaPipe URLs, `VITE_PROFILE_IMAGE_MAX_SIZE_MB`.

## 9. Tests

| Check | Status |
| --- | --- |
| Backend unit suite, 26 suites, 373 tests | PASS |
| Frontend suite, 15 files, 215 tests | PASS |
| Auth integration, 51 tests, including forged flags | PASS |
| Trainer on development data | PASS as a skip: 7 rows, no model |
| Live OTP, live TURN, full `test:db`, frontend production build after this change, browser demonstration | NOT RUN in Phase 19. Phase 20 reran the available checks. See [../phase-20/README.md](../phase-20/README.md). |

## 10. Outstanding dependencies

An SMTP or Twilio account, a TURN server, a TLS host, and a persistent database and disk. More interaction labels before the logistic model can be evaluated. The compatibility baseline does not depend on those.

## 11. Production-readiness checklist

- [x] Client flag is not a login decision
- [x] Unsigned profile photos follow visibility
- [x] Development OTP cannot start production
- [x] TURN absence fails production startup and is visible in the call UI
- [x] Ranker evaluation is the trainer's own skip message
- [x] Compatibility formula unchanged
- [ ] Live OTP delivery
- [ ] TURN relay tested
- [ ] Host selected and deployed
- [ ] Full database integration suite (rerun in Phase 20; see that report for the exit code)
- [ ] Production frontend build after removing face-api (completed in Phase 20)
