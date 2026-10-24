# Phase 14 — Admin Dashboard, User Management, Report Moderation & Monitoring

A protected admin panel for authorized administrators: platform
statistics, user management (search, suspend, reactivate), report review,
an append-only audit log, activity charts and ML monitoring. **Every rule
is enforced on the server**; the admin pages only reflect it.

| Layer | File |
| --- | --- |
| Migration | `src/db/migrations/20261024100000_create_admin_audit_logs.js` |
| Services | `src/services/adminService.js` (dashboard, activity, users, monitoring, ML), `src/services/reportService.js` (moderation), `src/services/auditService.js` |
| Models | `src/models/adminAuditLogModel.js`, `src/models/reportModel.js` (moderation queries) |
| HTTP | `src/routes/adminRoutes.js`, `src/controllers/adminController.js`, `src/validators/adminValidator.js` |
| Frontend | `layouts/AdminLayout.jsx`, `pages/admin/AdminDashboard.jsx`, `AdminUsers.jsx`, `AdminUserDetails.jsx`, `AdminReports.jsx`, `AdminReportDetails.jsx`, `AdminActivity.jsx`, `AdminMLMonitoring.jsx`, `components/admin/AdminParts.jsx`, `components/admin/ActivityChart.jsx`, `services/adminService.js` |
| Tests | `tests/phase14Admin.test.js`, `tests/integration/admin.test.js`, `frontend/src/pages/admin/admin.test.jsx` |

## 1. Admin sign-in and authorization

* **Roles:** the existing `users.role` (`user` | `admin`). No new roles.
* **No default admin and no credentials in code.** Register a normal
  account, verify it, then promote it on the server:
  `npm run admin:promote -- <email or mobile>`. There is no public admin
  sign-up.
* **Login:** `POST /api/v1/admin/login` accepts only admin accounts. Others
  get the same 401 as wrong credentials. It then uses the same live presence
  verification and JWT session as users.
* **Every other `/api/v1/admin/*` route** runs `requireAuth` and
  `requireRole('admin')`. `requireAuth` re-reads the session, **role and
  account status from the database on every request**: revoking a session,
  suspending an account or removing the admin role takes effect on the next
  request. Anonymous requests get 401, ordinary users 403.
* **Frontend:** `/admin/*` pages are behind `AdminRoute`. Visitors go to
  `/admin/login`, and signed-in users who are not admins go to their own
  dashboard. The role comes from `/auth/me` (server data), never from
  browser storage. This is only routing; the API decides.
* **Rate limits per admin:** `ADMIN_RATE_LIMIT_PER_MINUTE` (300) requests;
  `ADMIN_ACTION_RATE_LIMIT_PER_MINUTE` (30) for status changes; model
  training at most 2 per 10 minutes.

## 2. Admin API

| Method & path | Purpose |
| --- | --- |
| `GET /admin/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` | Aggregate statistics (default: last 30 days) |
| `GET /admin/activity?from&to` | Daily series from recorded events |
| `GET /admin/monitoring` | Platform health |
| `GET /admin/ml` | ML model metadata and status (Phase 9) |
| `POST /admin/ml/train` | Train a model (audited, rate-limited) |
| `GET /admin/users?page&limit&status&role&search` | User list |
| `GET /admin/users/:id` | One account |
| `PUT /admin/users/:id/status` | Suspend / reactivate |
| `GET /admin/reports?page&limit&status&reason&reportedUserId&reporterId&sort` | Report queue |
| `GET /admin/reports/:id` | One report with review history |
| `PUT /admin/reports/:id/status` | Moderation decision |
| `GET /admin/audit-logs?page&limit&action&targetType&targetId&adminId` | Audit history (read-only) |

These replace the Phase 3 placeholders. `PATCH /users/:userId/status` and
`PATCH /reports/:reportId` became the `PUT …/status` routes above.

**Validation:**
- Page sizes default to `ADMIN_DEFAULT_PAGE_SIZE` (20), capped at
  `ADMIN_MAX_PAGE_SIZE` (100).
- Statuses, roles, reasons, sort order and audit actions come from fixed
  lists.
- Dates must be real `YYYY-MM-DD` days, `from ≤ to`, within
  `ADMIN_MAX_RANGE_DAYS` (366).
- Search terms are at most 100 characters; LIKE wildcards are escaped, so
  `%` matches literally.
- Bodies are strict: unknown fields such as `role` get 422.
- Errors use the standard envelope, with no SQL, stack traces or secrets.

### Dashboard metrics (all real `COUNT(*)` / `GROUP BY` queries)

| Group | Values |
| --- | --- |
| Users | total, active, suspended, awaiting verification, deactivated, admins, registered in period |
| Reports | total, pending, under review, resolved, dismissed, submitted in period |
| Connections | active (accepted), pending requests, requests in period (from the Phase 10 interaction log) |
| Messages | total and in period, **counts only (content is never read)** |
| Video calls | total, in period, completed, missed, ongoing |

**Activity** gives day-by-day series (UTC, every day present) for:
- registrations
- connection requests and accepted connections (from the
  `activity_feedback` event log, so connections later removed still count
  on the day they happened)
- reports submitted and closed
- messages and calls

**Platform health:** database reachability and latency, connected socket
clients, whether the Redis adapter is on, active calls, uptime and memory.

New indexes keep these queries off full scans: `users (status,
created_at)`, `users (created_at)`, `messages (sent_at)`,
`connection_requests (created_at)`, `connection_requests (status,
responded_at)`, `video_calls (created_at)`, `reports (reviewed_at)`.

## 3. User management

* **List:** id, name, email, **masked mobile** (last 3 digits), role,
  status, joined, last login and open reports against the user. Sorted by
  id, newest first. Search covers email, mobile, profile name and exact id.
* **Details:** account state, profile content (age instead of the exact date
  of birth), aggregate counts (connections, pending requests, reports
  against and filed, blocked-by count, messages sent, calls) and the
  account's admin history. **Never shown:** password hash, OTPs,
  sessions/tokens, message or call content, TURN credentials.

### Account status transitions (`PUT /admin/users/:id/status`)

| From | To | Body |
| --- | --- | --- |
| `active` | `suspended` | `{ "status": "suspended", "reason": "…" (required, 3–500 chars), "reportId"?: n }` |
| `suspended` | `active` | `{ "status": "active", "reason"?: "…" }` |

Anything else gets 409. Safeguards:
- An admin cannot change their own status (400).
- Admin accounts cannot be suspended from the panel (403), which prevents
  lock-out and admin-on-admin abuse.
- Deleted or unknown users get 404.
- There is no deletion or permanent ban.
- The change is a conditional update in a transaction: of two simultaneous
  decisions one wins and the other gets 409.
- With `reportId`, the report must concern this user (422 otherwise), and
  it is stored in the audit entry.

**A suspension takes effect everywhere at once:**
- The status changes and all of the user's sessions are revoked, in the
  same transaction as the audit entry.
- Open Socket.IO connections are disconnected, and an active video call is
  ended (`endReason: account_suspended`).
- Every later REST request fails (401 for the revoked session, 403 for the
  suspended account), socket reconnects are refused, and login gets 403.
- Other users cannot message or call a suspended account, because the
  Phase 10 rule requires both accounts to be active.

Reactivation lets the user sign in again. Old sessions stay revoked.

## 4. Report moderation

`pending → under_review → resolved | dismissed`. A pending report may
also be resolved or dismissed directly. Closed reports stay closed (409).
Normal users cannot reach these routes (403), and the Phase 13 report body
rejects `status`.

`PUT /admin/reports/:id/status`:

```json
{ "status": "resolved", "resolutionNote": "User warned.", "actionTaken": "warning" }
```

* `actionTaken` is one of `none`, `warning` or `suspended`. It is a record
  of the decision only. **A report never changes an account by itself.** To
  suspend, the admin uses the account page from the report (`?report=<id>`),
  which links the suspension to the report.
* Each decision records `reviewed_by` and `reviewed_at`, and writes an audit
  entry (`from`, `to`, `actionTaken`, reported user) in the same
  transaction. A concurrent decision gets 409.
* **Report details** show: reporter and reported user (name, email,
  account status), category, the description as plain text, submission
  time, the reported user's open-report count and the review history.
  **Private chats and call content are not shown**; evidence access would
  need a separate, explicitly authorized workflow.
* Reporters keep seeing only `open`/`closed` (Phase 13).

## 5. Audit log (`admin_audit_logs`)

| Column | Notes |
| --- | --- |
| `audit_id` | PK |
| `admin_id` | FK → users, `SET NULL` (history survives if an admin account is removed) |
| `action` | CHECK: `user_suspended`, `user_reactivated`, `report_status_changed`, `ml_training_run` |
| `target_type` / `target_id` | `user`, `report` or `ml_model` + id |
| `reason` | ≤ 500 characters |
| `metadata` | Small JSON (`from`, `to`, `reportId`, `actionTaken`, `modelVersion`, `outcome`) |
| `created_at` | Indexed, also per target and per admin |

**Append-only:**
- The model has no update or delete method.
- There is no API route that changes entries (`PUT`/`DELETE` get 404).
- Entries are written in the same transaction as the change they describe.
- Entries never contain passwords, OTPs, tokens or message text.
- Only admins can read them, via `GET /admin/audit-logs` and the Activity
  page.

## 6. ML monitoring (`GET /admin/ml`)

The page shows only what the Phase 9 pipeline stored in
`ml_model_versions`:
- version, type, status and training time
- sample counts
- precision, recall, F1 and ROC-AUC, with "Not recorded" where a value is
  missing

It also shows aggregate interaction counts per action and the number of
positive and negative training labels. The status is honest:

| Status | When |
| --- | --- |
| `not_trained` | "ML model not yet trained" |
| `no_active_model` | Models exist but none is active |
| `insufficient_data` | The active model was trained on fewer than 50 samples |
| `trained` | Otherwise |

**No baseline comparison is shown**, because the training pipeline does not
record one. Model weights, training rows and per-user data are never
returned. "Train a new model" calls the existing Phase 9 pipeline; every
run, including "insufficient data", is audited.

## 7. Charts

The Activity page uses **small multiples**: one column chart per series,
each with its own scale (never a dual axis) and a table view of the same
numbers. Columns are at most 24 px wide with a 4 px rounded top and a 2 px
gap. Each chart has a hairline baseline, labels its peak, and has a hover
or keyboard-focus tooltip per day. Days with no events show "No activity in
this period". The series colour was checked with the data-viz palette
validator: `#2a78d6` on the light surface, and its own dark-mode step
`#3987e5` against the dark surface (`#1d1f29`). Both pass. Every admin page
was rendered in Chrome in light mode, dark mode and at 390 px; none
overflows horizontally.

## 8. Fixed while verifying this phase

* **Auth rate limit signed out active users.** `/auth/me` and `/auth/logout`
  counted toward the per-IP brute-force budget (100 requests / 15 min).
  Every page load calls `/auth/me`, so heavy browsing, or several people
  behind one IP, got 429s. The frontend then treated that as an expired
  session and signed the user out. Now:
  - `/me` and `/logout` (which need a valid token) are outside that budget.
  - The frontend ends the session only on 401/403 from `/auth/me`, and
    retries briefly on temporary errors.
  - Tests are in `tests/integration/auth.test.js` and
    `frontend/src/routes/AppRoutes.test.jsx`.

## 9. Known limitations

* Admin accounts can only be created or removed with `npm run admin:promote`
  or direct database work (by design: there is no admin management UI).
* An admin cannot suspend another admin from the panel. That needs direct
  database work and should go through your operations process.
* Lists use offset pagination. That is fine at admin scale; very deep pages
  on very large tables would be better served by cursors.
* Activity series are per UTC day.
* The rate-limit store is in memory unless `REDIS_URL` is set (Phase 11).
