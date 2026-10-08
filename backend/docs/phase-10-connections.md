# Phase 10 — Connection Requests & Connection Management

A recommended profile never becomes a connection by itself. A user must
explicitly send a connection request, and the other user must accept it. Only
accepted connections may use private chat (Phase 11) and video (Phase 12).

| Layer | File |
| --- | --- |
| Migration | `src/db/migrations/20261008170000_extend_connection_lifecycle.js` |
| Data access | `src/models/connectionRequestModel.js` |
| Business rules | `src/services/connectionService.js` (all rules live here) |
| Notification hooks | `src/services/connectionEvents.js` |
| HTTP | `src/controllers/connectionController.js`, `src/routes/connectionRoutes.js` |
| Tests | `tests/phase10Connections.test.js` (unit), `tests/integration/connections.test.js` (real DB) |
| Frontend | `frontend/src/services/connectionService.js`, `components/connections/ConnectionButton.jsx`, `pages/connections/ConnectionRequests.jsx`, `pages/connections/Connections.jsx` |

## 1. Lifecycle

```
                        ┌── accept (receiver) ──▶ accepted ── remove (either member) ──▶ disconnected
(none) ── send ──▶ pending ── reject (receiver) ──▶ rejected
                        └── cancel (sender) ────▶ cancelled

rejected | cancelled | disconnected ── send ──▶ pending   (new request, same row)
```

Any other transition (for example `rejected → accepted`, accepting twice, or
removing a pending request) is refused with **409**.

### Statuses

| Status | Meaning |
| --- | --- |
| `pending` | Sent, waiting for the receiver |
| `accepted` | Connected. The only status that allows communication |
| `rejected` | Declined by the receiver |
| `cancelled` | Withdrawn by the sender while pending |
| `disconnected` | A connection that one of the members removed |

Statuses are stored in `connection_requests.status` (lowercase, CHECK
constraint). There is no `is_connected` flag.

### Re-requesting

Two users share **one** `connection_requests` row for their whole history.
A new request after the relationship ended re-opens that row as `pending`.
The direction is set to the new sender and `created_at` is reset. Every
step is kept in `activity_feedback`, so the history is not lost.

* After **cancelled** or **disconnected**, either user may send a new request.
* After **rejected**, the user who rejected may send a request at any time.
  The user whose request was declined must wait
  `REJECTED_REQUEST_COOLDOWN_DAYS` (30) from the rejection. This stops
  repeated requests to someone who has said no.

### Reverse requests (selected behaviour)

If A → B is pending and B tries to send B → A, no second request is created.
The API returns **409**:

> This user has already sent you a connection request. Accept or reject it from your received requests.

The UI never offers this action, because the connection button shows
**Accept / Reject** to B (state `pending_incoming`). The request is not
accepted automatically, because acceptance must always be an explicit action
on the request.

## 2. Database changes

`connection_requests` (existing Phase 2 table, extended — no new table):

| Change | Why |
| --- | --- |
| status CHECK + `cancelled`, `disconnected` | Explicit lifecycle states |
| `pair_low_id`, `pair_high_id` — stored generated columns `LEAST/GREATEST(sender_id, receiver_id)` | Direction-independent pair key, maintained by the database |
| `UNIQUE (pair_low_id, pair_high_id)` `uq_connection_requests_user_pair` | One row per pair in **either** direction, so reverse duplicates and concurrent inserts are impossible at database level |
| `responded_at` (nullable) | When the receiver accepted or rejected. Used for `connectedAt` and the rejection cooldown |
| index `(sender_id, status)` | Sent requests and connection lists |

`activity_feedback`:

| Change | Why |
| --- | --- |
| action CHECK + `connection_cancelled`, `connection_removed` | New interaction events |
| `connection_request_id` FK → `connection_requests` (`ON DELETE SET NULL`), indexed | Links each event to its request |

Existing constraints still apply: FKs to `users` (`RESTRICT`), the
`sender_id <> receiver_id` CHECK, `UNIQUE (sender_id, receiver_id)`, and the
`updated_at` trigger. The migration is reversible. On rollback,
`cancelled`/`disconnected` rows become `rejected` and the two new
activity actions are deleted.

`GENERATED ALWAYS AS (...) STORED` is supported by PostgreSQL 12+, MySQL 8.0
and MariaDB 10.4+, which are the project's supported engines. The migration was
verified on MariaDB 10.4.32.

## 3. API

All endpoints require `Authorization: Bearer <access token>`. The acting user
is always the token owner. `senderId`, `userId` and similar fields in a body
are stripped by validation and never used. Validation errors return **422**
with field errors (project convention).

| Method & path | Who | Purpose |
| --- | --- | --- |
| `POST /api/v1/connections` | any user | Send a request `{ "receiverId": 12 }` |
| `GET /api/v1/connections` | any user | My accepted connections |
| `GET /api/v1/connections/requests/received` | any user | Pending requests sent to me |
| `GET /api/v1/connections/requests/sent` | any user | My requests that are pending or were declined |
| `GET /api/v1/connections/status/:userId` | any user | Relationship with another user (drives the button) |
| `GET /api/v1/connections/:id` | members only | One request/connection |
| `PUT /api/v1/connections/:id` | see below | `{ "action": "accept" \| "reject" \| "cancel" }` |
| `DELETE /api/v1/connections/:id` | members only | Remove an accepted connection (→ `disconnected`) |

`/status/:userId` is an addition to the requested list. The frontend needs it to
load the button state from the backend instead of guessing it locally.

### Examples

**Send** — `POST /api/v1/connections` `{ "receiverId": 12 }` → `201`

```json
{
  "success": true,
  "message": "Connection request sent successfully.",
  "data": {
    "connection": {
      "id": 41, "status": "pending", "direction": "outgoing",
      "senderId": 7, "receiverId": 12,
      "createdAt": "2026-10-08T10:00:00.000Z", "respondedAt": null, "updatedAt": "2026-10-08T10:00:00.000Z"
    }
  }
}
```

**Accept** — `PUT /api/v1/connections/41` `{ "action": "accept" }` → `200`,
message `Connection request accepted.`, `data.connection.status = "accepted"`.

**Received** — `GET /api/v1/connections/requests/received`

```json
{
  "success": true,
  "message": "Request successful",
  "data": {
    "requests": [
      {
        "id": 41,
        "sender": { "userId": 7, "name": "Asha Patil", "profilePicture": "http://…/x.webp", "age": 30, "location": "Kolhapur, Maharashtra, India" },
        "status": "pending",
        "createdAt": "2026-10-08T10:00:00.000Z"
      }
    ]
  }
}
```

**Sent** items have `receiver` instead of `sender`, plus `respondedAt`.

**My connections** — `GET /api/v1/connections`

```json
{ "success": true, "message": "Request successful",
  "data": { "connections": [ { "connectionId": 41, "user": { "userId": 12, "name": "…", "profilePicture": null, "age": 29, "location": "Pune, Maharashtra, India" }, "connectedAt": "2026-10-08T10:05:00.000Z" } ] } }
```

**Details** — `GET /api/v1/connections/41` returns the connection fields above
plus `user`, the other member's public card.

**Status** — `GET /api/v1/connections/status/12`

```json
{ "success": true, "message": "Request successful",
  "data": { "userId": 12, "state": "pending_incoming", "connectionId": 41, "canSendRequest": false, "canCommunicate": false } }
```

`state` is one of `none`, `pending_outgoing`, `pending_incoming`,
`connected`, `rejected` (only the declined sender sees this, with
`canSendRequestAfter`), and `unavailable` (blocked).

### Error responses

| Status | When | Message |
| --- | --- | --- |
| 400 | Request to yourself | `You cannot send a connection request to yourself.` |
| 400 | Sender has no profile | `Create your profile before sending connection requests.` |
| 401 | Missing/invalid token | `Authentication required` |
| 403 | Block in either direction (send/accept) | `You cannot connect with this user.` |
| 403 | Sender accepts/rejects, receiver cancels | `Only the recipient can accept…` / `…reject…` / `Only the sender can cancel…` |
| 404 | Receiver missing, inactive or without profile | `User not found.` |
| 404 | Unknown id, or a record the user is not a member of | `Connection request not found.` / `Connection not found.` |
| 409 | Duplicate pending | `Connection request already pending.` |
| 409 | Reverse request | `This user has already sent you a connection request…` |
| 409 | Already connected | `Users are already connected.` |
| 409 | Declined sender within cooldown | `Your previous request was declined. You can send a new request after <date>.` |
| 409 | Invalid transition / lost a race | `This connection request is no longer pending.` / `Only an active connection can be removed.` |
| 409 | Concurrent duplicate insert | `A connection request between you and this user already exists.` |
| 422 | Missing/malformed id, unsupported action | `Validation failed` + `errors[]` |

Database errors and stack traces are never returned (central error handler).

## 4. Authorization and security rules

| Action | Allowed for |
| --- | --- |
| Send | Token owner → active receiver with a profile; not self; no block either way |
| Accept | Receiver only, while pending, no block |
| Reject | Receiver only, while pending (allowed even after a block) |
| Cancel | Sender only, while pending |
| Remove | Either member, while accepted |
| View details | Either member; hidden (404) when a block exists |

* **Non-members get 404, not 403.** A user cannot find out whether a record id
  exists by changing the id. Members acting in the wrong role get 403.
* **Blocking** is checked in both directions with `Block.isBlocked`. A blocked
  pair cannot send or accept requests, and is hidden from all lists and from
  details. The status endpoint reports `unavailable` without saying who
  blocked whom. The block endpoints are still Phase 3 placeholders, so blocks
  can only be created directly in the `blocks` table for now.
* **Privacy**: responses contain only `userId`, `name`, `profilePicture`,
  derived `age` and `location`. Email, mobile, exact date of birth, password
  hash, OTP and session data are never selected. The profile model has no
  per-field privacy settings yet. Eligibility means an active account with a
  profile.
* **Concurrency**: inserts are protected by the pair UNIQUE index (a unique
  violation becomes 409). Every state change is a conditional `UPDATE … WHERE
  status = <expected>`, so of two simultaneous actions only one succeeds.
  The other gets 409. No row locks are taken, which avoids InnoDB gap-lock
  deadlocks.
* **Transactions**: the state change and its interaction event are written in
  one transaction. Notification events are emitted only after commit.

## 5. Interaction events (ML signal)

Each successful action writes one `activity_feedback` row (actor → target) in
the same transaction, with `connection_request_id`:

| Event | `action` value | Actor → target |
| --- | --- | --- |
| request sent | `connection_request` | sender → receiver |
| request accepted | `connection_accepted` | receiver → sender |
| request rejected | `rejection` | receiver → sender |
| request cancelled | `connection_cancelled` | sender → receiver |
| connection removed | `connection_removed` | remover → other member |

The first three reuse the action names that Phase 9 training
(`src/ml/scripts/train_model.js`) already reads as positive/negative labels.
That is why they are not renamed to `connection_request_sent` and so on. The
two new actions are stored for future retraining. Phase 9 ignores them today.
Refused attempts (duplicates, wrong user) log nothing. The service writes
directly to `activity_feedback` and does **not** call
`feedbackService.recordFeedback`, because that runs an online ML training step. Retraining stays
with the Phase 9 process.

## 6. Notifications

The platform has no notification system yet. `connectionEvents` (a Node
`EventEmitter`) is the hook point. Phase 11+ subscribes to it:

```js
const { connectionEvents, CONNECTION_EVENTS } = require('./services/connectionEvents');
connectionEvents.on(CONNECTION_EVENTS.REQUEST_ACCEPTED, ({ actorUserId, targetUserId, connectionId }) => { /* notify targetUserId */ });
```

The events are `connection.request_sent`, `connection.request_accepted`,
`connection.request_rejected`, `connection.request_cancelled` and
`connection.removed`. Each payload is
`{ connectionId, actorUserId, targetUserId, status, occurredAt }`. A failing listener is logged and
never fails the request.

## 7. Chat and video precondition

```js
const { canUsersCommunicate, assertCanCommunicate } = require('./services/connectionService');
await canUsersCommunicate(userA, userB);   // boolean
await assertCanCommunicate(userA, userB);  // throws 403 otherwise
```

This is true only when the pair's status is `accepted`, neither user has
blocked the other, and both accounts are `active`. `pending`, `rejected`,
`cancelled` and `disconnected` always return false. Phase 11 should call it on
every message send and socket join, and Phase 12 before starting a call.
Accepted connections expose `canCommunicate: true` in the status response.

## 8. Frontend

* **ConnectionButton** loads `GET /connections/status/:userId` and reloads it after every
  action. It is used on match cards and in the match details modal. States:
  *Send Connection Request*, *Request Pending*, *Accept Request / Reject*,
  *Connected*, *Request Declined*, *Unavailable*. While a request is in
  flight the button is disabled and repeated clicks are ignored (ref guard).
* **`/connections/requests`** has Received and Sent tabs (accept, reject,
  cancel), with empty and error states.
* **`/connections`** lists accepted connections with *View Profile*
  (`/matches?view=<userId>` opens the match details), *Chat*
  (`/messages?with=<userId>`, the Phase 11 placeholder page) and *Remove*.

## 9. Known limitations

* No block/unblock API yet (Phase 3 placeholder), so blocks must be inserted directly.
* No per-field privacy settings exist. Only public card fields are returned.
* Compatibility is not shown on the requests page. *View Profile* opens the
  match details, which include it.
* Notifications are event hooks only. Nothing is delivered to users yet.
* Lists are not paginated.
