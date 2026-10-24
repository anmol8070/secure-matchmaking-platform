# API index

Base path: `/api/v1`. The registry is `backend/src/routes.js`. Success and error envelopes are documented in the root README. Request and response fields for each phase remain in `backend/docs/`.

Public groups:

| Prefix | Purpose |
| --- | --- |
| `/health` | Liveness. No authentication. |
| `/auth` | Register, OTP, password or OTP login, complete live verification, logout, current user. |
| `/admin/login` | Administrator password login. Other `/admin` routes require an admin session. |
| `/dev` | Development OTP outbox. Mounted only when `NODE_ENV` is not production and `OTP_PROVIDER=dev`. |

Protected groups (Bearer access token):

| Prefix | Purpose |
| --- | --- |
| `/profile` | Own profile, profile photo, another member's privacy-filtered profile. |
| `/preferences` | Preferences, hobbies, quiz answers. |
| `/hobbies` | Active hobby catalogue. |
| `/matches` | Ranked candidates and one pair's score breakdown. |
| `/recommendations` | Same recommendation pipeline as matches. |
| `/connections` | Requests, acceptance, rejection, removal, relationship status. |
| `/messages` | Private text and image messages between accepted connections. |
| `/calls` | WebRTC call lifecycle and ICE server list. |
| `/reports` | Member reports. |
| `/blocks` | Block, list, unblock. A block may include a reason. |
| `/privacy` | Own visibility settings. |
| `/feedback` | Interaction events used by ranking and training. |
| `/admin` | Dashboard, users, reports, audit log, ML monitoring and training. Role checked per request. |

Socket.IO is attached to the same HTTP server. Chat and call events require the same JWT and a live session. Event names are listed in `backend/docs/phase-11-chat.md` and `backend/docs/phase-12-video-calls.md`.

Login verification (`POST /auth/login-verification/complete`) accepts a verification token, face count, optional confidence, and an optional `profile_matched` boolean. The boolean does not change the outcome. The body rejects an uploaded image. The saved result records `biometric_identity_verified: false`. The login challenge returns `has_profile_photo` and does not return the picture. Upload remains `PUT /profile/photo`.

`GET /media/profile-photos/:filename` serves a generated `uuid.webp` name. A 10-minute signature, or a signed-in member who passes photo visibility and block checks, is required. "everyone" means any member. An anonymous request without a signature is refused.

Phase 19 record: [../phase-19/README.md](../phase-19/README.md).

