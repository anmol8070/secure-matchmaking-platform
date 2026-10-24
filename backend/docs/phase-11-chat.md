# Phase 11 — Private Chat / Real-Time Messaging

Private one-to-one chat between **accepted connections**, delivered in real
time with Socket.IO and stored in the database. Video calling (WebRTC) is
Phase 12 and is not part of this phase.

| Layer | File |
| --- | --- |
| Migration | `src/db/migrations/20261021100000_extend_messages_for_chat.js` |
| Data access | `src/models/messageModel.js` |
| Business rules | `src/services/messageService.js` (all messaging rules) |
| Images | `src/services/chatImageService.js`, `src/services/storage/privateLocalStorage.js`, `uploadChatImage` in `src/middleware/uploadMiddleware.js` |
| Blocking | `src/services/blockService.js`, `src/controllers/blockController.js`, `src/routes/blockRoutes.js` |
| Rate limit | `src/services/messageRateLimiter.js` (memory, or Redis with `REDIS_URL`) |
| Redis (optional) | `src/config/redis.js` |
| Event hooks | `src/services/messageEvents.js` |
| Validation | `src/validators/messageValidator.js` (shared by REST and sockets) |
| REST | `src/controllers/messageController.js`, `src/routes/messageRoutes.js` |
| Socket.IO | `src/sockets/index.js`, `events.js`, `presence.js`, `realtime.js`; attached in `server.js` |
| Socket smoke check | `scripts/chat-smoke.js` (`npm run smoke:chat`) |
| Tests | `tests/phase11Messaging.test.js` (unit), `tests/integration/chat.test.js` (real DB + real sockets + images + blocks) |
| Frontend | `services/socketService.js`, `services/messageService.js`, `components/chat/ChatImage.jsx`, `pages/chat/PrivateChat.jsx` (`/chat/:userId`), `pages/chat/Messages.jsx` (`/messages`) |

## 1. Who may chat

The rule comes from Phase 10's `connectionService.canUsersCommunicate()`.
It is reused, not re-implemented.

| Relationship | Send | Read history |
| --- | --- | --- |
| `accepted`, no block, both accounts active | ✅ | ✅ |
| `pending`, `rejected`, `cancelled`, no relationship | ❌ 403 | ❌ 403 |
| `disconnected` (connection removed) | ❌ 403 | ✅ read-only, if messages exist |
| Block in either direction | ❌ 403 | ❌ 403 (and no room access; images refused too) |

A removed connection keeps its history, because nothing is deleted. A new
accepted connection between the same pair reopens the same conversation.
Every send, history load, room join and read receipt is checked again
server-side.

## 2. Data model (no new tables)

A conversation is always exactly two users. Each pair already has exactly
one `connection_requests` row (Phase 10), so **conversation id = the pair's
`connection_requests.request_id`**. The Phase 2 `messages` table already had
`sender_id`, `receiver_id`, `message`, `sent_at` and `read_at`. Phase 11
adds:

| Column / index | Purpose |
| --- | --- |
| `message_type` varchar(20), default `text`, CHECK (`text`, `image`) | Text or image message |
| `attachment_key`, `attachment_content_type`, `attachment_width`, `attachment_height`, `attachment_size` | The stored image of an image message (key is server-generated, never returned) |
| `delivered_at` nullable | When a receiver device got the message |
| `idx_messages_pair_id (sender_id, receiver_id, message_id)` | History pages are cut by `message_id`, so each direction is read in id order |

`chk_messages_not_empty` became `chk_messages_content`: a text message needs text,
and an image message needs an attachment, with an optional caption (`message = ''`).

Existing indexes still serve the rest: `idx_messages_conversation` and
`idx_messages_receiver` (receiver inbox and unread counts).

Status is derived, never stored separately:
`read_at` → **read**, `delivered_at` → **delivered**, otherwise **sent**.

## 3. REST API

All endpoints require `Authorization: Bearer <token>`. The sender or reader
is always the token owner. A `senderId` in the body is stripped and ignored.

| Method & path | Purpose |
| --- | --- |
| `GET /api/v1/messages/conversations` | My conversations: participant card, last message, unread count, `canSend` |
| `GET /api/v1/messages/:userId?limit=50&before=<messageId>` | One page of history with that user |
| `POST /api/v1/messages` | Send `{ "receiverId": 12, "message": "Hello!", "type": "text" }` (`type` is optional) |
| `POST /api/v1/messages/images` | Send an image: `multipart/form-data` with `image` (file), `receiverId`, `caption` (optional) |
| `GET /api/v1/messages/:id/image` | The image file, for the sender and the receiver only |
| `GET /api/v1/blocks`, `POST /api/v1/blocks` `{ userId }`, `DELETE /api/v1/blocks/:userId` | List, add (idempotent) and remove blocks |
| `PUT /api/v1/messages/:id/read` | Mark that message, and earlier unread ones from the same sender, as read (receiver only) |

The Phase 3 placeholders `POST /messages/:userId` and
`PATCH /messages/:userId/read` were replaced by `POST /messages` and
`PUT /messages/:id/read`, so no duplicate endpoints remain.

### History and pagination

* `limit`: 1 to `MESSAGE_MAX_LIMIT` (100), default `MESSAGE_DEFAULT_LIMIT` (50). Anything else returns 422.
* `before`: a message id cursor. The newest page is returned first. Each page is
  ordered **oldest → newest** for display. Pass `pagination.nextCursor` as
  `before` to load older messages.
* Ordering uses the unique `message_id`, so pages never overlap or skip,
  even while new messages arrive.
* Loading history marks the caller's incoming messages **delivered**.

```json
{
  "success": true,
  "message": "Request successful",
  "data": {
    "conversationId": 41,
    "participant": { "userId": 12, "name": "Riya Shah", "profilePicture": null, "age": 29, "location": "Pune" },
    "canSend": true,
    "messages": [
      { "id": 501, "conversationId": 41, "senderId": 7, "receiverId": 12, "type": "text",
        "message": "Hello!", "status": "read", "createdAt": "2026-10-21T10:00:00.000Z",
        "deliveredAt": "2026-10-21T10:00:01.000Z", "readAt": "2026-10-21T10:02:00.000Z" }
    ],
    "pagination": { "limit": 50, "hasMore": false, "nextCursor": null }
  }
}
```

`POST /messages` returns `201` with `data.message` in the same shape. Text
messages have `"image": null`.

### Images

```json
{ "id": 502, "type": "image", "message": "Look at this!",
  "image": { "path": "/messages/502/image", "contentType": "image/webp", "width": 640, "height": 480, "size": 18734 } }
```

* Accepted: JPG, PNG and WEBP. The declared type, extension **and** real file
  signature must all match. The maximum size is `CHAT_IMAGE_MAX_SIZE_MB` (5).
* Permission and the rate limit are checked **before** the image is processed.
  Unauthorized uploads are never stored.
* Every image is re-encoded to WEBP, auto-rotated and resized to fit
  `CHAT_IMAGE_MAX_DIMENSION` (1600 px). EXIF/GPS metadata, and anything hidden
  in the file, is dropped. No face or identity processing of any kind is done.
* Files go to **private** storage (`PRIVATE_UPLOADS_DIR`, default
  `uploads-private/`). That folder is not under the public `/media` route.
  `image.path` (relative to `/api/v1`) is served by `GET /messages/:id/image`
  only to the two participants: others get 404, a blocked pair gets 403.
  Responses use `Cache-Control: private`. The storage key is never exposed.
* If the message row cannot be saved, the stored file is deleted again.
* Images are sent only over REST (multipart). `message:send` accepts text only.
  The socket still delivers the new image message (`message:received`) like
  any other.
* The browser fetches images with the access token and shows them from an
  object URL. A plain `<img src>` cannot send the token.

### Errors

| Status | When |
| --- | --- |
| 400 | Message to yourself |
| 401 | Missing/invalid/revoked token |
| 403 | `Messaging is available only between connected users.` (not connected) / `You cannot message this user.` (blocked) / `Only the recipient can mark a message as read.` |
| 404 | `User not found.` (missing/inactive user) / `Message not found.` (unknown id, or a message or image you are not part of) |
| 413 | Image larger than `CHAT_IMAGE_MAX_SIZE_MB` |
| 415 | Not a JPG/PNG/WEBP image (type, extension or file signature) |
| 422 | Empty or too-long message/caption, unsupported type, missing image file, malformed ids, bad `limit`/`before` |
| 429 | `You are sending messages too quickly. Please wait a moment.` |

## 4. Socket.IO

Socket.IO runs on the **same HTTP server and port** as the REST API
(`server.js`), with the same CORS origins. Frames are capped at 32 KB.

### Authentication

```js
io(API_ORIGIN, { auth: { token: '<access token>' } });   // or Authorization: Bearer header
```

The handshake uses the same check as REST, `sessionService.authenticate`:
JWT signature and expiry, a server-side session that is not revoked, and an
active account. A missing token, a malformed token or an invalid session is
refused with a `connect_error`: `Authentication required` or
`Invalid or expired token`. The user id comes only from the token.
**Logout disconnects that session's sockets immediately.** An event that
arrives after the session expires is refused, and the socket is disconnected.

Every socket joins `user:<id>`, so one user with several tabs or devices
receives everything on each of them, and `session:<id>`, which is used for
logout. Clients never name a room.

### Client → server events

Each one takes an acknowledgement callback that receives
`{ success: true, ... }` or `{ success: false, error, code }`.

| Event | Payload | Ack on success | Rules |
| --- | --- | --- | --- |
| `conversation:join` | `{ userId }` | `{ conversationId, canSend, participantOnline }` | Server checks access, then joins `conversation:<id>` |
| `conversation:leave` | `{ userId }` | `{}` | |
| `message:send` | `{ receiverId, message, type? }` | `{ message }` | Same validation, permission and rate limit as REST; ack only after the DB write |
| `message:read` | `{ messageId }` | `{ read: { messageIds, readAt, ... } }` | Receiver only |
| `typing:start` / `typing:stop` | `{ userId }` | `{}` | Only from a socket still in the conversation room that joined with send permission; never stored |

An unknown event is answered with `{ success: false, error: 'Unknown event.', code: 400 }`,
through the ack if one was given, otherwise through a `chat:error` event.

### Server → client events

| Event | Sent to | Payload |
| --- | --- | --- |
| `message:received` | receiver's devices (with ack), sender's devices | message object (as in REST) |
| `message:delivered` | sender | `{ conversationId, senderId, receiverId, messageIds, deliveredAt }` |
| `message:read` | sender and reader | `{ conversationId, senderId, readerId, messageIds, readAt }` |
| `presence:update` | conversation room | `{ userId, online }` |
| `typing:start` / `typing:stop` | conversation room (not the sender) | `{ userId, conversationId }` |
| `conversation:closed` | conversation room | `{ conversationId, canSend: false, reason }`. `reason` is `disconnected` (connection removed) or `unavailable` (blocked). Every socket is then taken out of the room |

### Delivery semantics

1. `message:send` (or `POST /messages`) validates the message, checks
   permission and the rate limit, and **saves it**.
2. The sender gets the ack with the saved message. If saving fails, the ack
   is `success: false` and nothing is emitted.
3. `message:received` goes to the receiver's devices. If a device
   **acknowledges** it within 5 s, the message becomes **delivered** and the
   sender gets `message:delivered`. Being online alone does not count.
4. An offline receiver gets the message from `GET /messages/:userId` later,
   which also marks it delivered.
5. While the conversation is open **and the tab is visible**, a read receipt
   is sent for the newest incoming message. It marks that message and all
   earlier ones as **read**. A background tab sends nothing until the user
   comes back.

Clients de-duplicate by message id. The same message can arrive through the
REST/ack response, `message:received` and a refetch after reconnecting.

### Presence

Presence comes from the socket connection state, looked up through the
Socket.IO adapter (`fetchSockets`), so it covers every instance when Redis
is enabled. A user is online while at least one socket is connected. It is announced only into
conversation rooms the user joined, and is never broadcast globally.
Presence is separate from delivery status.

## 5. Security controls

* Authentication: the same token and session check as REST, on every socket.
* Authorization: `canUsersCommunicate` plus block checks run on every send,
  history load, room join and read receipt. Room membership is granted by
  the server only after that check.
* Identity: the sender or reader is always the token owner. Payload ids only
  name the other user.
* Privacy: messages are returned only to their sender and receiver.
  Non-members get 404 for message ids. Admin endpoints expose no message
  content.
* Validation: text is trimmed, NUL characters are stripped, length is
  limited to `MESSAGE_MAX_LENGTH` (2000), and only the `text` type is
  accepted. Malformed payloads return 422.
* XSS: messages are stored and returned as plain text. The frontend renders
  them as React text (no `dangerouslySetInnerHTML`), so markup is displayed,
  not executed.
* Rate limit: `MESSAGE_RATE_LIMIT` messages (default 60) per
  `MESSAGE_RATE_WINDOW_SECONDS` (default 60) per user. REST and sockets share
  the budget (text and images). Exceeding it returns 429 or a socket ack
  with `code: 429`.
* Blocking: `POST /blocks` immediately closes the pair's open conversation
  (`conversation:closed`, sockets removed from the room). Every send, read,
  image download and join is refused in both directions until
  `DELETE /blocks/:userId`. Since Phase 13 a block also ends the
  connection (accepted → disconnected), so unblocking restores nothing: the
  users must connect again (see phase-13-privacy-safety.md).
* Logging: only ids are logged (`id`, `senderId`, `receiverId`,
  `conversationId`), never message text. The logger also redacts any key
  containing "message".
* Errors: socket errors are controlled `{ success:false, error, code }`
  objects, with no stack traces or database details.

## 6. Running several instances (`REDIS_URL`)

By default the API runs as one instance with in-memory state. Set
`REDIS_URL` (e.g. `redis://localhost:6379`) and every instance shares:

* Socket.IO rooms, events and delivery acks, through `@socket.io/redis-adapter`,
  so a message reaches a receiver connected to any instance;
* presence (`fetchSockets` goes through the adapter);
* the message rate limit, stored as Redis keys `chat:rate:<userId>:<window>`.
  If Redis is briefly unreachable, the limiter falls back to memory instead of
  blocking chat.

`server.js` connects the adapter before it starts listening, and refuses to
start if Redis is configured but unreachable. The Redis URL is never logged.

## 7. Verifying the real-time layer

Postman collections cannot script Socket.IO. Folders 13 (chat, images) and
16 (blocking) cover the REST side. For the socket events, run against a
running server:

```bash
CHAT_SMOKE_URL=http://localhost:5000 CHAT_SMOKE_TOKEN_A=<token> \
CHAT_SMOKE_TOKEN_B=<token of an accepted connection> npm run smoke:chat
```

It checks token refusal, authentication, joining, typing, send ack,
real-time receipt, delivery and read receipts. The integration suite
(`tests/integration/chat.test.js`) covers the same events and more.

## 8. Notifications and Phase 12

* **Notifications:** none exist yet. `messageEvents` (`message.created`,
  `message.delivered`, `message.read`) is the integration point. A future
  notifier can subscribe and use `realtime.getServer()` or presence to decide
  whether the receiver is offline.
* **Phase 12 (video):** reuse `connectionService.canUsersCommunicate` or
  `assertCanCommunicate` before allowing WebRTC signalling. The authenticated
  socket, the `user:<id>` rooms and the `conversation:<id>` rooms are already
  in place for signalling events.

## 9. Known limitations

* Images are the only attachment type. Files, audio and video are not
  supported.
* Images use local private disk storage. A cloud provider would implement the
  same put/read/remove functions in `services/storage`.
* The Redis mode is covered by unit tests with a fake client. No Redis
  server was available here to test it end to end.
