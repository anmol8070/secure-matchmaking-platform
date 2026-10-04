# Authentication Flow

How users and admins register, verify, log in and stay signed in (Phase 4). For the API structure see [api-architecture.md](api-architecture.md), and for the tables see [database-schema.md](database-schema.md).

> **Profile Picture and Login Verification Photo are independent features.**
> - The login verification photo is taken from the live camera, used only to check that **one real face is present**, and then discarded in the browser. It is never uploaded, stored, recognised or compared.
> - The profile picture (`profiles.profile_photo_url`, built in Phase 5) can come from the gallery, a file or the camera, needs no face detection, and has no influence on login.
> - There is no face matching between them.

## 1. Registration flow

```
Register (email and/or mobile + password)
  → account created as pending_verification, password hashed
  → OTP sent to the email (or the mobile if no email was given)
  → POST /auth/verify-otp
  → account active (email_verified_at / mobile_verified_at set)
  → user can log in
```

`POST /api/v1/auth/register` (public):

```json
{ "email": "user@example.com", "mobile": "9876543210", "password": "Secure123" }
```

| Rule | Detail |
| --- | --- |
| Contact | Email and/or mobile is required |
| Email | Valid format, at most 254 characters, stored lower-case |
| Mobile | Stored in E.164 format. `9876543210` and `98765 43210` become `+919876543210`; set the default prefix with `DEFAULT_COUNTRY_CODE` |
| Password | 8–128 characters, with at least one letter and one number |
| Duplicates | `409` with field errors (`This email is already registered`, `This mobile number is already registered`) |

Response `201`:

```json
{
  "success": true,
  "message": "Registration successful. OTP sent for verification.",
  "data": { "user_id": 123, "otp_required": true, "otp_channel": "email", "otp_destination": "us**@example.com" }
}
```

The response never contains the OTP, the password or the password hash.

## 2. OTP flow

| Endpoint | Body | Purpose |
| --- | --- | --- |
| `POST /auth/send-otp` | `{ "email" }` or `{ "mobile" }` | Resend an account-verification OTP |
| `POST /auth/verify-otp` | `{ "email" \| "mobile", "otp" }` | Verify the account |
| `POST /auth/login/send-otp` | `{ "identifier" }` | Send a login OTP (active accounts only) |
| `POST /auth/login/verify-otp` | `{ "identifier", "otp" }` | Log in with an OTP (step 1) |

**Generation and storage**

- The code is generated with `crypto.randomInt`, a cryptographically secure generator. Its length is `OTP_LENGTH` (default 6).
- Only `HMAC-SHA256(code, OTP_SECRET)` is stored, in `otp_codes.otp_hash`. A plain hash would not be enough, because a 6-digit code could be brute-forced offline from a leaked database.
- Each row records `user_id`, `purpose` (registration or login), `channel`, `expires_at` (now + `OTP_EXPIRY_MINUTES`, default 5), `attempts`, `status` (active, verified or invalidated), `created_at` and `verified_at`.
- Issuing a new code **invalidates** the previous active code for the same user, purpose and channel.

**Verification**

1. Lock the latest active code (`SELECT … FOR UPDATE`).
2. If it is expired, or `attempts ≥ OTP_MAX_ATTEMPTS`, invalidate it.
3. Compare the hashes in constant time.
4. On a wrong code, `attempts + 1`. At the limit the code is invalidated, even if the correct code is submitted afterwards.
5. On a correct code, set `status = verified` and `verified_at`. The code cannot be reused.

Wrong, expired, used, missing and over-limit codes all return the same response:

```json
{ "success": false, "message": "Invalid or expired OTP" }
```

**Sending and resend limits**

- `send-otp` and `login/send-otp` give the same answer whether or not the account exists: `If the account exists, an OTP has been sent.`
- Resend cooldown: `OTP_RESEND_COOLDOWN_SECONDS` (60) → `429 Please wait N seconds before requesting another OTP`.
- Hourly cap: `OTP_MAX_SENDS_PER_HOUR` (5) per account, purpose and channel → `429 Too many OTP requests. Please try again later.`

**Delivery providers** (`src/services/otpDelivery/`)

- `OTP_PROVIDER=dev` is **development only**. Codes go to an in-memory outbox, readable with `GET /api/v1/dev/otp?destination=<email|mobile>`. The frontend shows a "Show development OTP" button in dev builds; it is removed from production builds.
- Production refuses to start with `OTP_PROVIDER=dev`. The dev route is never mounted in production.
- To add email or SMS delivery: implement `send({ channel, destination, code, purpose, expiresAt })` in a new provider file and register it in `otpDelivery/index.js`. A delivery failure returns `503 Could not send the OTP right now…`.
- Codes are never logged.

## 3. Login flow

```
Email/mobile + password ── or ── email/mobile + OTP
                 │
                 ▼
         credentials valid? ── no ──► 401 Invalid credentials
                 │ yes
                 ▼
     account status allowed? ── no ──► 403 (see "Account status")
                 │ yes
                 ▼
 temporary verification session (login_verifications row, 5 min)
   → { requires_live_verification: true, verification_token }
                 │
                 ▼
 /login-verification: live camera → capture → face detection
     0 faces  → "No face detected. Please take the photo again."             (retry)
     2+ faces → "Multiple faces detected. Please ensure only one person…"    (retry)
     1 face   → POST /auth/login-verification/complete
                 │
                 ▼
 user_sessions row + JWT access token → dashboard
```

`POST /auth/login` (public):

```json
{ "identifier": "user@example.com", "password": "Secure123" }
```

Response `200`. The `verification_token` is **not** an access token:

```json
{
  "success": true,
  "message": "Credentials verified. Live verification required.",
  "data": { "requires_live_verification": true, "verification_token": "…43 chars…", "verification_expires_in": 300 }
}
```

- An unknown user and a wrong password both return `401 Invalid credentials`. For unknown users the password is still checked against a dummy hash, so the two cases take the same time.
- OTP login (`/auth/login/verify-otp`) returns the same challenge. **OTP success never bypasses live verification.**
- Admins use `POST /admin/login` (same body). Non-admin accounts get `401 Invalid credentials`. Admins then complete the same live verification.

**Account status**, checked only after the password or OTP has been proven:

| `users.status` | Result |
| --- | --- |
| `active` | Continue |
| `pending_verification` | `403 Please verify your account with the OTP sent to you before logging in.` |
| `suspended`, `banned` (blocked), `deactivated`, `deleted` | `403 This account cannot sign in. Please contact support.` |

## 4. Password security

- Passwords are hashed with **scrypt** (Node's built-in `crypto`, memory-hard), N=16384, r=8, p=1, a 16-byte random salt and a 64-byte key.
- Stored format: `scrypt$N$r$p$salt$hash`. The parameters are stored with each hash so they can be raised later.
- Comparison is constant-time (`crypto.timingSafeEqual`). Passwords are normalised to Unicode NFKC before hashing.
- Passwords are never stored, logged, returned or sent back to the frontend, and neither is `password_hash`. Responses use `User.toPublic()`, an allow-list of fields.
- The 128-character maximum limits how much hashing work one request can cause.

## 5. JWT / session flow

- **When:** the access token is issued **only** by `POST /auth/login-verification/complete`, after both credentials/OTP and live verification succeeded.
- **Algorithm:** HS256, signed with `JWT_SECRET`, expiring after `JWT_EXPIRES_IN` (default `1d`).
- **Claims:** only `{ user_id, role, typ: "access", jti, iat, exp }`. Nothing sensitive.
- **Server-side session:** every token has a `user_sessions` row (`token_id` = `jti`, `expires_at`, `revoked_at`, `login_verification_id`).
- **Each request checks:**
  1. signature, algorithm and expiry;
  2. that the session exists and is not revoked or expired;
  3. that the user is still `active`.

  Suspending an account therefore blocks its existing tokens immediately (403).
- **Client side:** the access token is kept in `sessionStorage`. It survives page reloads, ends when the tab closes, and is sent as `Authorization: Bearer <token>`. The temporary verification token is kept only in memory.

Response from `POST /auth/login-verification/complete`:

```json
{
  "success": true,
  "message": "Login verification successful",
  "data": {
    "access_token": "eyJ…",
    "token_type": "Bearer",
    "expires_in": 86400,
    "user": { "user_id": 123, "email": "user@example.com", "mobile": null, "role": "user", "status": "active" }
  }
}
```

`GET /auth/me` (Bearer token) returns `user_id`, `email`, `mobile`, `role`, `status`, `email_verified_at`, `mobile_verified_at`, `last_login_at` and `created_at`. It never returns a password, hash, OTP or secret.

## 6. Authorization

| Middleware | File | Effect |
| --- | --- | --- |
| `requireAuth` | `middleware/authMiddleware.js` | Missing token → `401 Authentication required`. Bad, expired or tampered token → `401 Invalid or expired token`. Revoked session → `401 Session has expired or been revoked…`. Inactive account → `403`. Sets `req.user` and `req.auth = { userId, role, sessionId }` |
| `requireRole('admin')` | `middleware/roleMiddleware.js` | Wrong role → `403 You do not have permission to perform this action` |

| Route group | Protection |
| --- | --- |
| `/health`, `/auth/*` (except `/me`, `/logout`), `/admin/login` | Public (rate-limited) |
| `/auth/me`, `/auth/logout`, `/profile`, `/preferences`, `/hobbies`, `/matches`, `/recommendations`, `/connections`, `/messages`, `/reports`, `/blocks`, `/feedback` | `requireAuth` |
| `/admin/*` (except `/admin/login`) | `requireAuth` + `requireRole('admin')` |

Roles are `user` (default) and `admin`. There is no public admin sign-up; promote a registered, active account with:

```bash
npm run admin:promote -- admin@example.com
```

## 7. Live human/face presence verification

**What it checks:** "Is exactly one real face in front of the camera?"

**What it does not do:** recognise faces, identify the person, verify biometric identity, compare with the profile photo, or store face embeddings.

**Browser side** (`frontend/src/pages/user/LoginVerification.jsx`):

1. After step 1 the app navigates to `/login-verification`. That route is reachable only while a verification session exists.
2. The camera opens with `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })` and shows a live preview.
3. **Take photo** draws the current frame onto an in-memory `<canvas>`.
4. The **MediaPipe Face Detector** (BlazeFace short-range, running locally in WebAssembly) counts the faces. The canvas is cleared immediately afterwards.
5. 0 faces or 2+ faces: the user is asked to retake the photo, and nothing is sent.
6. Exactly 1 face: only the result is sent:

```json
{ "verification_token": "…", "face_detected": true, "face_count": 1, "confidence": 0.96, "detector": "mediapipe-blazeface-short-range" }
```

7. The camera is switched off and the app moves to the dashboard (or the admin dashboard).

**Server side** (`verificationService.completeVerification`):

- **Token check:** the verification token must exist (looked up by its SHA-256 hash), still be `pending` and not be expired (`LOGIN_VERIFICATION_EXPIRY_MINUTES`).
- **Rule:** the face count is evaluated again on the server (one face passes, zero or several fail) and the attempt is counted.
- **Strict body:** the request schema rejects any extra field (e.g. `image`) with 422, so images cannot be submitted.
- **What is stored:** only `{ face_detected, face_count, confidence, detector, outcome }` in `login_verifications.detection_result`. No images, no biometric data.
- **On success:** status `passed`, then the session and JWT are created and linked to the verification row.
- **Single use:** a used, failed or expired token is rejected (`401 Invalid or expired verification session. Please log in again.`).
- **Attempt limit:** after `LOGIN_VERIFICATION_MAX_ATTEMPTS` failed attempts the session fails (`429 Too many verification attempts. Please log in again.`).
- **Account re-check:** the account status is checked again, because it may have changed since step 1.

**Trust model and limits**

Detection runs in the user's browser, so a modified client could send a fake "one face" result. These controls narrow that risk:
- the result is accepted only with a valid, unexpired, single-use verification token that requires the correct password or OTP first;
- attempts are limited and rate-limited;
- every attempt is recorded.

Running detection on the server would mean uploading camera images, which this design deliberately avoids. `verificationService` is the single integration point if a trusted or server-side detector is added later.

## 8. Camera permission behaviour

| Situation | Message shown | Can the user continue? |
| --- | --- | --- |
| Permission granted | Live preview + **Take photo** | Yes |
| Permission denied (`NotAllowedError`) | "Camera permission is required to complete login verification. Allow camera access in your browser settings and try again." | No — **Try again** button |
| No camera (`NotFoundError`, `OverconstrainedError`) | "No camera was found. Connect a camera to complete login verification." | No |
| Camera busy or failed to start (`NotReadableError`) | "The camera is being used by another application or could not be started…" | No |
| Browser without camera API | "Your browser does not support camera access…" | No |
| Insecure page (not HTTPS / localhost) | "Camera access requires a secure (HTTPS) connection." | No |
| Camera stream ends unexpectedly | "Could not start the camera. Please try again." | No |
| Face detector cannot load (network) | "Face detection could not be loaded. Check your internet connection and try again." | Retry |

Without passing verification **no access token exists**, so the dashboard stays unreachable. The camera is stopped when the page is left. An overlapping start (for example React StrictMode starting it twice) is discarded so the camera is never left running.

## 9. Verification failure behaviour

| Failure | Where | Result |
| --- | --- | --- |
| No face | Browser (and server) | Retry message; session stays pending |
| Multiple faces | Browser (and server) | Retry message; session stays pending |
| Session expired, already used or invalid | Server `401` | Returned to the login page with "Your verification session has expired. Please log in again." |
| Too many attempts | Server `429` | Returned to the login page; must log in again |
| Account suspended meanwhile | Server `403` | Returned to the login page with the account message |
| Profile picture missing, different, or showing no face | — | **No effect.** Verification does not look at the profile picture (covered by tests) |

## 10. Logout

**Strategy: server-side revocable sessions.**

- `POST /auth/logout` (Bearer token) sets `user_sessions.revoked_at` for the current session.
- Because every request checks the session row, the token is rejected **immediately** afterwards: `401 Session has expired or been revoked. Please log in again.` The JWT is not merely forgotten by the client.
- Other sessions of the same user (other devices or tabs) stay valid. There is no refresh token; the user logs in again when the access token expires (`JWT_EXPIRES_IN`).
- The frontend clears `sessionStorage` even if the logout request fails.

## 11. Security rules

| Rule | Implementation |
| --- | --- |
| No plain-text passwords | scrypt hashes only |
| No hashes or secrets in responses | `User.toPublic()` allow-list; tests assert no `password`, `hash` or `otp` in responses |
| No OTPs in production responses or logs | Hash-only storage; dev outbox only outside production; logger redaction |
| No tokens or passwords in logs | The access log omits query strings, headers and bodies; the logger redacts `password`, `otp`, `token`, `authorization`, `secret`, … |
| Strong secrets | Production refuses to start unless `JWT_SECRET` and `OTP_SECRET` are random values of 32+ characters and not placeholders |
| OTP expiry, attempt and resend limits | `OTP_EXPIRY_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_SENDS_PER_HOUR` |
| Brute-force protection | Per-IP limit on all `/auth` requests (`AUTH_RATE_LIMIT_MAX`), plus failed checks per IP + account (`AUTH_FAILED_ATTEMPTS_MAX`). There is **no account lockout**, so attackers cannot lock real users out |
| Input validation | zod schemas for every auth body; emails and mobiles normalised; unknown fields rejected on the verification endpoint |
| Protected and admin APIs | `requireAuth`, `requireRole('admin')` |
| No unnecessary camera images | Frames stay in browser memory, are cleared after detection, and are never sent or stored |
| HTTPS | Required in production. Browsers allow camera access only on HTTPS or localhost. Set `TRUST_PROXY` behind a load balancer |

## 12. Error handling

| Status | When |
| --- | --- |
| 400 | Malformed JSON |
| 401 | Invalid credentials; invalid or expired OTP; invalid or expired verification session; missing, invalid, expired or revoked access token |
| 403 | Unverified account (`pending_verification`); suspended, banned, deactivated or deleted account; wrong role; disallowed CORS origin |
| 409 | Email or mobile already registered |
| 422 | Validation errors (with `errors[]`); no face; multiple faces |
| 429 | OTP resend cooldown or hourly cap; too many failed attempts; too many verification attempts; too many requests |
| 503 | Database unavailable; OTP provider failure |

All errors use `{ "success": false, "message": "…", "errors"?: [...] }`. Failures never reveal whether an OTP was wrong or expired, or (on login) whether an account exists.

## Configuration summary

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | — (required in production) | Access-token signing key |
| `JWT_EXPIRES_IN` | `1d` | Access-token lifetime |
| `OTP_SECRET` | falls back to `JWT_SECRET` outside production | HMAC key for OTP hashes |
| `OTP_LENGTH` / `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS` | `6` / `5` / `5` | OTP rules |
| `OTP_RESEND_COOLDOWN_SECONDS` / `OTP_MAX_SENDS_PER_HOUR` | `60` / `5` | Resend limits |
| `OTP_PROVIDER` | `dev` | Delivery provider (`dev` refused in production) |
| `LOGIN_VERIFICATION_EXPIRY_MINUTES` / `LOGIN_VERIFICATION_MAX_ATTEMPTS` | `5` / `5` | Live verification session |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` / `AUTH_RATE_LIMIT_MAX` / `AUTH_FAILED_ATTEMPTS_MAX` | `15` / `100` / `10` | Rate limits |
| `DEFAULT_COUNTRY_CODE` | `+91` | Prefix for 10-digit mobiles |
| `TRUST_PROXY` | off | Real client IPs behind a proxy |

## Known limitations

- **No real OTP provider yet.** Only the development provider exists. Production deployment needs an email or SMS provider (section 2).
- **Detection is client-side.** See the trust model in section 7.
- **The rate-limit store is in memory, per process.** Use a shared store (e.g. Redis) when running several API instances.
- **No refresh tokens and no "log out everywhere".** Both can be added on top of `user_sessions`.
