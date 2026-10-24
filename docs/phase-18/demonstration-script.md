# Demonstration script

Use the local development servers only. Do not point this script at a production host. Do not photograph one-time codes, access tokens, or the contents of `.env`.

## Prepare

1. In `backend`, start `npm run dev`. Confirm `GET http://127.0.0.1:5000/api/v1/health` returns `success: true`.
2. In `frontend`, start `npm run dev` and open `http://localhost:5173`.
3. Database client for this checkout is MySQL. Migrations should already be applied (`npm run db:status` shows none pending).
4. With `OTP_PROVIDER=dev`, registration codes are not emailed. The verification page can show the development code. Do not include that code in a slide or a screenshot.
5. Camera login needs a real camera. A still photograph is not the intended path: one face must sit in the marker. This audit did not repeat that physical check, so stop the demo at that step if the camera is refused and say the step was not shown.
6. Local accounts already created for chat and calls, if they are still in this database:
   - Member: `meera.patil@example.com` / `Meera1234` (female test profile).
   - Connected member: `anmol11403@gmail.com`. The password for that account is not recorded in this script. Sign in only if you already know it.
   - Administrator: `admin@example.com` / `admin1234`, if that promoted account is still present.
   These are local test accounts. Change or delete them before any shared deployment.

If a step below fails, record the failure. Do not describe the step as demonstrated.

## User sequence

1. Open `/`. Show the landing page and the hero. Resize the window and open the navigation. This audit did not recheck every width.
2. Register a new test user at `/register` with an `example.com` address and a password of at least 8 characters containing a letter and a number. Do not use a real person's address.
3. Complete OTP using the development code on that machine. Do not read the code aloud in a recording if the recording will be published. Say that the code came from the development outbox.
4. Sign in at `/login`. Complete the camera step. If this account has no profile picture, the frame is kept for the profile. If it has one, the live face must match or the screen shows the mismatch message and login does not finish.
5. Create or edit the profile. Use the change-photo dialog for a new picture. That upload is separate from the login camera.
6. Open preferences. Set hobbies and save. A toast should appear at the top right.
7. Open matches. Open one breakdown and read the location, age, preference, hobby, and quiz parts. Say that the total is the sum of those parts, clamped to 100, and that missing parts can score a midpoint.
8. Send a connection request to the second test account.
9. Sign in as the second account in another browser profile, accept the request, and return.
10. Exchange a short text message on `/chat/:userId`. Use test text only.
11. Start a call from `/video?with=<userId>` only if both browsers can reach each other. If it fails, say that TURN is not configured and the call was not demonstrated.
12. Open privacy settings and change one visibility level. Save.
13. Block the test account, choose a reason, and confirm the blocked list shows that reason. Report is the other button and does not require a block.

## Admin sequence

1. Sign in at `/admin/login` with the promoted test administrator and complete the camera step.
2. Open the dashboard and the user list. Do not open a real member's private fields on a shared screen.
3. Open a report created in the user sequence, or say that no report was filed if that step was skipped.
4. Show a status change only on the test report or the test user.
5. Sign in as a normal member and open `/admin/dashboard`. The expected result is that the admin area is refused. The API returns 403 for a non-admin token.

## Steps this audit did not perform

The script is written so it can be repeated. Walking it in a browser, including camera, chat, and video, was not part of the 24 October 2026 command run. Treat those items as a checklist, not as a completed demonstration.

---

## Phase 19 notes for a later demonstration

These steps were not walked in a browser during Phase 19.

1. Camera login checks one face in the marker for that verification token. Say that this is not a match against the profile picture. A client that sends `profile_matched: true` does not receive a stronger login than a client that omits the flag.
2. An unsigned profile-photo URL without a session should be refused. A signed URL from an API response should load, then fail after it expires.
3. With `OTP_PROVIDER=dev`, the code is in the development outbox, not in the server log. Production refuses to start with that provider.
4. `GET /calls/ice-servers` currently returns STUN only and `relay: false`, because no TURN URL is set. Do not describe a relay credential that the response does not contain.

