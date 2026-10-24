# Phase 13 — Privacy Settings, Blocking & User Reporting

Users control who sees each part of their profile, can block and unblock
other users, and can report abuse for moderator review. **Every rule is
enforced on the server**; the frontend only reflects it.

| Layer | File |
| --- | --- |
| Migrations | `20261023100000_create_privacy_settings.js`, `20261023110000_extend_reports.js` |
| Privacy (single filtering point) | `src/services/privacyService.js`, `src/models/privacySettingModel.js` |
| Privacy API | `src/routes/privacyRoutes.js`, `src/controllers/privacyController.js`, `src/validators/privacyValidator.js` |
| Profile view | `GET /profile/:userId` → `profileService.getProfileForViewer` |
| Blocking | `src/services/blockService.js` (+ `connectionService.severForBlock`), `src/routes/blockRoutes.js` |
| Reporting | `src/services/reportService.js`, `src/models/reportModel.js`, `src/routes/reportRoutes.js`, `src/validators/reportValidator.js` |
| Frontend | `pages/privacy/PrivacySettings.jsx` (`/privacy`), `pages/privacy/BlockedUsers.jsx` (`/privacy/blocked`), `components/safety/SafetyActions.jsx`, `components/safety/ReportDialog.jsx`, `services/privacyService.js`, `services/safetyService.js` |
| Tests | `tests/phase13Privacy.test.js`, `tests/integration/privacy.test.js`, `frontend/src/pages/privacy/privacy.test.jsx` |

## 1. Privacy settings

`GET /api/v1/privacy/settings` · `PUT /api/v1/privacy/settings` (Bearer
token). Settings always belong to the token owner. Validation is strict:
unknown keys, invalid levels, or a `userId` in the body get **422**. Send
only the settings you want to change.

| Setting | Values | Default | Controls |
| --- | --- | --- | --- |
| `profileVisibility` | `everyone`, `connections` | `everyone` | `connections` hides the profile from non-connections in recommendations and match details. Elsewhere (e.g. a pending request) they see the name only, plus the photo if `photoVisibility` allows |
| `photoVisibility` | `everyone`, `connections`, `nobody` | `everyone` | Profile picture |
| `ageVisibility` | ″ | `everyone` | Age (the exact date of birth is never shown) |
| `locationVisibility` | ″ | `everyone` | City / state / country |
| `educationVisibility` | ″ | `everyone` | Education |
| `occupationVisibility` | ″ | `everyone` | Occupation |
| `lifestyleVisibility` | ″ | `everyone` | Lifestyle (and food/diet reasons derived from it) |
| `bioVisibility` | ″ | `everyone` | About me |
| `hobbiesVisibility` | ″ | `everyone` | Hobbies, common hobbies |
| `onlineStatusVisibility` | ″ | `connections` | Online/offline in chat and calls |

`everyone` means any signed-in member allowed to see the profile.
`connections` means accepted connections only. `nobody` means only the
user. **Always shown:** user id, name and gender (gender is hidden on
restricted profiles). **Never shown to others, whatever the settings:**
email, mobile, exact date of birth, password, OTP, session and other
account data. The table holds no secrets. A user without a row gets the
defaults.

```json
PUT /api/v1/privacy/settings   { "locationVisibility": "nobody", "hobbiesVisibility": "connections" }
200 { "success": true, "message": "Privacy settings saved.", "data": { "settings": { "profileVisibility": "everyone", "locationVisibility": "nobody", … } } }
```

### Enforcement: one place

All profile data shown to other users goes through `privacyService`:

| Where | What is filtered |
| --- | --- |
| `GET /profile/:userId` (new) | Full profile. Hidden fields are `null` and listed in `hiddenFields`, and `restricted: true` for connections-only profiles. A blocked pair, or a missing or inactive account, gets **404** |
| `GET /matches`, `/recommendations` | Connections-only profiles are left out for non-connections. Hidden fields are removed from the card, `commonHobbies`, the **"why this match" reasons**, `scoreBreakdown` and `mlFeatures`. **Search filters only match visible values**, so a hidden location cannot be found by filtering on it |
| `GET /matches/:userId` | Same filtering. A connections-only profile gives **403** to non-connections |
| Connection lists and requests, connection details | Cards (photo, age, location per settings) |
| Chat header (`participant`), conversation list | Cards |
| Call cards (`otherUser`), incoming-call caller card, call history | Cards |
| Blocked list, own reports | Cards as any member would see them |
| Online status: `conversation:join` `participantOnline`, `presence:update`, `call:initiate` `receiverOnline` | `null` / not sent unless `onlineStatusVisibility` allows |

The overall compatibility score stays visible: it is an aggregate and
reveals no single field. The Phase 7 formula and the Phase 9 model are
unchanged.

## 2. Blocking

| Method & path | Purpose |
| --- | --- |
| `POST /api/v1/blocks` `{ "blockedUserId": 12 }` (`userId` also accepted) | Block. 201 if new, 200 if already blocked |
| `GET /api/v1/blocks` | Users I blocked (public card, block date) |
| `DELETE /api/v1/blocks/:userId` | Unblock. Only the blocker; **404** if you have not blocked them |

The blocker is always the token owner. Blocking yourself gets 400; an
unknown or deleted user gets 404. Duplicates are prevented by
`uq_blocks_pair` and are idempotent.

### What a block does (both directions)

1. The block is saved first, so every later request is checked against it.
2. **The relationship ends.** An accepted connection becomes
   `disconnected` (logged as `connection_removed` for ML). A pending
   request becomes `cancelled`.
3. Open chats are closed immediately (`conversation:closed`, reason
   `unavailable`) and every socket leaves the room. Typing, sending,
   joining and history are refused (403).
4. An active call between them is ended immediately (`call:ended`,
   `endReason: unavailable`). Further signalling gets 409.
5. While the block exists, everything is refused in both directions:
   connection requests, accepting requests, messages (REST and socket),
   images, calls (place, accept, signal), profile view (404), match details
   (403) and recommendations (excluded).

Caches cannot bypass a block:
- Recommendations are computed per request with the block filter, and the
  cached `matches` scores are never returned on their own.
- The call permission cache (5 s) is irrelevant because the call is ended
  on the block event.
- Chat sockets are removed from the room.

**Unblocking** removes the block only and restores nothing:
- The connection stays `disconnected` (or `cancelled`), so the users must
  send a new request to talk again.
- **Message history is never deleted.** It is hidden while blocked.
  Afterwards it follows the normal Phase 11 rule: a disconnected pair with
  history can read it, but cannot send.

## 3. Reporting

| Method & path | Purpose |
| --- | --- |
| `GET /api/v1/reports/reasons` | Allowed categories with labels |
| `POST /api/v1/reports` | File a report |
| `GET /api/v1/reports` | My own reports (open/closed only) |

```json
POST /api/v1/reports   { "reportedUserId": 12, "reason": "HARASSMENT", "description": "Optional details." }
201 { "success": true, "message": "Thank you. Your report has been received and will be reviewed by our team.",
      "data": { "report": { "id": 31, "reportedUserId": 12, "reason": "harassment", "description": "Optional details.", "state": "open", "createdAt": "…" } } }
```

* **Categories:** `harassment`, `spam`, `fake_profile`,
  `inappropriate_content`, `threatening`, `other`. Upper or lower case is
  accepted; they are stored in lower case. **Description:** optional, up to
  2000 characters, trimmed.
* **Validation:** reporting yourself gets 400 and an unknown user 404.
  Invalid categories, long descriptions, or extra fields (`status`,
  `reporterId`, …) get 422. The reporter always comes from the token.
* **Duplicates:** repeating an *open* report by the same reporter about the
  same user for the same reason returns the existing report (200) without
  creating a new row. Reports from different users are always kept.
* **Rate limit:** `REPORT_RATE_LIMIT_PER_HOUR` (10) per user; beyond it, 429.
* **No automatic punishment:** filing a report never changes the reported
  account.
* **Privacy:** reporters see only their own reports, with `state`
  `open`/`closed`. They never see moderation status, notes, actions or
  reviewers. Logs contain ids and the category, never the description.

### Statuses and admin integration (Phase 14)

`reports.status` is `pending → under_review → resolved | dismissed`
(closed reports stay closed). Normal users have no way to change it:
`/admin/*` requires the admin role (403 otherwise), and the report body
rejects a `status` field. `reportService` already provides the moderation
functions Phase 14 will wire to `/admin/reports`. Each checks that the
caller is an active admin:

* `listReportsForReview(adminId, { status, limit, after })`
* `getReportForReview(adminId, reportId)`
* `updateReportStatus(adminId, reportId, { status, resolutionNote, actionTaken })`:
  valid transitions only (409 otherwise). It records `reviewed_by` and
  `reviewed_at`. `actionTaken` is one of `none`, `warning`,
  `content_removed`, `suspended`, `banned`; applying a suspension to the
  account stays a separate, explicit admin action.

## 4. Database changes

* **`privacy_settings` (new):** `user_id` PK/FK → users (CASCADE), the ten
  `*_visibility` columns with CHECKs and defaults, and timestamps
  maintained by the database. A missing row means defaults, so no backfill
  is needed.
* **`reports` (extended):**
  - `reason` became a category code: `varchar(30)` with CHECK
    `chk_reports_reason`.
  - New columns: `description` (CHECK ≤ 2000), `resolution_note`, and
    `action_taken` (CHECK).
  - New index `idx_reports_duplicate (reporter_id, reported_id, reason, status)`.
  - **Existing free-text reasons are preserved:** they move to
    `description` with `reason = 'other'`. The rollback moves them back.
    Verified on the test database.
* `blocks` is unchanged; it already prevents duplicates and self-blocks.

## 5. Also fixed in this phase

Concurrent connection requests between the same two users could hit an
InnoDB deadlock and return **500**. A stress test hit it in 20/20 rounds of
six simultaneous requests. Lock conflicts are now retried
(`dbErrors.withLockRetry`), and the retry correctly answers 409. The same
retry protects placing video calls. A regression test is in
`tests/integration/connections.test.js`.

## 6. Known limitations

* The overall compatibility score is still shown when individual fields
  are hidden. It is an aggregate, but in theory a strong score hints at
  shared traits.
* Privacy applies per field. There are no per-person exceptions, and no
  "hide my profile from everyone" mode (that would also block connecting).
* No user search exists yet. Any future search must use
  `privacyService.recommendationContext` the same way recommendations do.
* The admin review screens and routes are Phase 14. The service functions
  are ready.
