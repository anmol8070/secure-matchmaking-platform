# Phase 19 — Blocker-to-code mapping

Date: 24 October 2026. Status labels match the tests that were run. [README.md](README.md) is the same record in shorter form. Phase 20 reran the checks and drove the photo route over HTTP. That later record is [../phase-20/README.md](../phase-20/README.md).

## 1. Client-trusted face flag

- **Files:** `backend/src/services/verificationService.js`, `backend/src/services/authService.js`, `frontend/src/pages/user/LoginVerification.jsx`, `frontend/src/services/authService.js`.
- **Endpoint:** `POST /api/v1/auth/login-verification/complete`.
- **Impact:** The server never received the comparison image, so a client boolean was not evidence of a match.
- **Change:** `applyProfileRule` returns the presence outcome and ignores the flag. The browser no longer runs a face comparison. The stored result sets `biometric_identity_verified` to false and does not keep an image. The token stays hashed, expiring, and single-use. Attempt limits remain.
- **Tests:** Auth integration, 51 passed. Forged `profile_matched` true and false both completed a one-face login. Zero faces and more than one face still fail. Expired and replayed tokens fail.
- **Dependency:** None.
- **Status:** Addressed. This is not certified liveness or identity recognition. A modified client can still report one face.

## 2. Public profile photos

- **Files:** `backend/src/routes/mediaRoutes.js`, `backend/src/services/storage/photoSignature.js`, `backend/src/services/storage/index.js`.
- **Endpoint:** `GET /media/profile-photos/:filename`.
- **Impact:** A known path was fetchable without a session, including when visibility said otherwise.
- **Change:** Unsigned requests need a signed-in member. Owner and admin may view. Blocks deny. `everyone` means any member. `connections` needs an accepted connection. `nobody` is owner and admin only. API responses add a 10-minute HMAC signature. The filename must be a UUID `.webp`.
- **Tests:** `tests/profilePhotoSecurity.test.js` inside the passing unit suite covers the signature and the access decision. The HTTP route was not driven with a stored file in this pass.
- **Limitation:** A valid signature is not re-checked against a later privacy change until it expires.
- **Status:** Addressed for unsigned URLs.

## 3. Development OTP outbox

- **Files:** `backend/src/services/otpDelivery/` (`dev`, `smtp`, `twilio`, `production`), `backend/src/config/environment.js`, `backend/server.js`.
- **Endpoints:** `POST /api/v1/auth/send-otp`, `POST /api/v1/auth/login/send-otp`. `GET /api/v1/dev/otp` only when not production and the provider is `dev`.
- **Change:** Production already refused `OTP_PROVIDER=dev`. The SMTP and Twilio adapters read credentials from the environment. Production startup now also requires those credentials and `WEBRTC_TURN_URL`.
- **Tests:** `tests/otpDelivery.test.js` inside the unit suite. Missing credentials throw, and the error text does not contain a code. No live message was sent. STARTTLS was not verified against a server.
- **Status:** Adapters present. Delivery NOT RUN.

## 4. No TURN server

- **Files:** `backend/src/services/callService.js` (`getIceServers`), `frontend/src/hooks/useVideoCall.js`, `frontend/src/pages/video/VideoCall.jsx`.
- **Endpoint:** `GET /api/v1/calls/ice-servers`.
- **Change:** Short-lived HMAC-SHA1 credentials were already minted when `WEBRTC_TURN_URL` and `WEBRTC_TURN_SECRET` are set. The secret is not returned. This checkout has an empty TURN URL, so `relay` is false and the call page says so. Production will not start without `WEBRTC_TURN_URL`.
- **Tests:** Existing ICE unit tests in the passing suite. No live call.
- **Status:** Blocked on a TURN host. No failure-rate percentage is claimed.

## 5. Unevaluated ranker

- **Files:** `backend/src/services/matchingService.js`, `backend/src/services/recommendationService.js`, `backend/src/ml/scripts/train_model.js`.
- **Change:** The compatibility formula was not replaced. The trainer was run on the development database.
- **Result:** 11 `activity_feedback` rows. Eligible labeled rows: 7, all positive, 0 rejections. The script stopped and wrote no model. No Precision@K, recall, or ROC-AUC.
- **Baseline:** With no active `ml_model_versions` row, ranking uses the compatibility score. A unit-test fixture row that had been inserted into the development database was deleted, and that test no longer writes there.
- **Status:** Evaluated as insufficient. The baseline remains.

## 6. No production host

- **Change:** [production-deployment-guide.md](production-deployment-guide.md) and [environment-variable-inventory.md](environment-variable-inventory.md) describe a provider-independent layout. No host was selected or purchased.
- **Status:** Specification only. Not deployed.
