# Diagrams

These diagrams follow the current routes and services. Unimplemented mail, SMS, TURN, and Redis boxes are omitted. TURN is a deployment option in `.env.example`, not a running service in this audit.

## 1. System architecture

```mermaid
flowchart TB
  member[Member browser]
  admin[Admin browser]
  api[Express API and Socket.IO]
  db[(Database)]
  media[Public profile uploads]
  privateFiles[Private chat images]

  member -->|HTTPS REST /api/v1| api
  admin -->|HTTPS REST /api/v1| api
  member -->|Socket.IO chat and call signals| api
  api --> db
  api --> media
  api --> privateFiles
  member -->|WebRTC media, peer to peer| member
```

Local development uses HTTP on ports 5173 and 5000. The diagram shows the intended production boundary.

## 2. Registration and authentication

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant D as Database
  B->>A: POST /auth/register
  A->>D: user row, password hash
  B->>A: POST /auth/send-otp
  A->>D: HMAC of code, expiry
  Note over B,A: Development only: GET /dev/otp
  B->>A: POST /auth/verify-otp
  A->>D: mark destination verified
  B->>A: POST /auth/login or login OTP
  A->>D: verification session
  A-->>B: verification token, not an access token
  B->>B: camera presence check
  B->>A: POST /auth/login-verification/complete
  A->>D: session row
  A-->>B: access token
```

## 3. Login camera verification

```mermaid
flowchart TD
  start[Verification token received]
  cam[Open camera]
  scan[Count faces about every 280 ms]
  none[No face or more than one]
  fit{Face centre inside marker and size in range?}
  hold[Hold still or movement at least 0.08]
  complete[POST complete with face count only]
  save[If no profile photo, upload frame after login]
  start --> cam --> scan
  scan --> none --> scan
  scan --> fit
  fit -->|no| scan
  fit -->|yes| hold --> complete
  complete --> save
```

Phase 19: the server decides from the face count and the single-use verification token. A `profile_matched` value is stored only as "a client sent a boolean" and does not change the outcome. The image is not uploaded. The diagram that compared the live frame with the profile picture described the earlier client-trusted check. That check is no longer the login decision.

## 4. Profile and preferences

```mermaid
flowchart LR
  create[POST /profile]
  photo[PUT /profile/photo]
  prefs[POST or PUT /preferences]
  hobbies[Hobby ids in the same save]
  quiz[Quiz answers in the same save]
  db[(profiles, preferences, user_hobbies, quiz_answers)]
  create --> db
  photo --> db
  prefs --> hobbies --> db
  prefs --> quiz --> db
```

The preferences page sends preferences, hobbies, and quiz answers together. The service writes them in one transaction.

## 5. Compatibility scoring and ranking

```mermaid
flowchart TD
  load[Load both profiles, seeker preferences, hobbies, quiz answers]
  loc[Location 0-10 plus age 0-15]
  life[Food, lifestyle, education, occupation, cap 25]
  hob[Hobby Jaccard times 25]
  quiz[Shared-answer fraction times 25]
  sum[Clamp the sum to 0-100]
  why[Build reason strings]
  rank[Sort by recommendation score]
  load --> loc --> sum
  load --> life --> sum
  load --> hob --> sum
  load --> quiz --> sum
  sum --> why --> rank
```

## 6. Adaptive recommendation

```mermaid
flowchart TD
  base[Compatibility score]
  model{Active model in ml_model_versions?}
  prob[Logistic probability from compatibility features]
  blend["0.40 times score plus 0.60 times probability times 100"]
  fallback[Use the compatibility score]
  base --> model
  model -->|yes| prob --> blend
  model -->|no| fallback
```

Training is a separate admin action. It reads `activity_feedback` and writes a model version. It does not run on every recommendation request.

## 7. Connection request

```mermaid
sequenceDiagram
  participant S as Sender
  participant A as API
  participant R as Receiver
  S->>A: POST /connections
  A-->>S: pending
  R->>A: GET /connections/requests/received
  R->>A: PUT /connections/:id accept or reject
  Note over S,R: Chat and calls require accepted
  S->>A: DELETE /connections/:id
  A-->>S: disconnected
```

A block moves an accepted connection to disconnected and a pending request to cancelled.

## 8. Private messaging

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant O as Other member
  B->>A: REST send or history, Bearer token
  A->>A: accepted connection and no block
  A-->>O: Socket.IO event if connected
  B->>A: Socket.IO send, typing, read
```

Image bytes are stored in the private upload directory. History is cursor-paginated.

## 9. WebRTC signalling

```mermaid
sequenceDiagram
  participant C as Caller
  participant A as API
  participant E as Callee
  C->>A: POST /calls
  A-->>E: ring on Socket.IO
  E->>A: POST /calls/:id/accept
  C->>A: ICE server list
  E->>A: ICE server list
  C->>E: offer, answer, ICE via Socket.IO
  Note over C,E: Audio and video stay peer to peer
  C->>A: POST /calls/:id/end
```

Without a TURN URL, ICE uses the configured STUN server only.

## 10. Blocking and reporting

```mermaid
flowchart TD
  blockBtn[Block]
  reason[Choose a reason]
  postB[POST /blocks]
  endRel[End connection, chat, and calls]
  reportBtn[Report]
  postR[POST /reports]
  queue[Admin report queue]
  blockBtn --> reason --> postB --> endRel
  reportBtn --> postR --> queue
```

The reason codes are harassment, spam, fake_profile, inappropriate_content, threatening, and other. The API accepts a missing reason so older clients still work. The current UI always sends one.

## 11. Admin moderation

```mermaid
flowchart TD
  login[POST /admin/login then camera step]
  role{Database role is admin?}
  dash[Dashboard, users, reports, audit log]
  action[Suspend, reactivate, or set report status]
  audit[admin_audit_logs]
  deny[403]
  login --> role
  role -->|yes| dash --> action --> audit
  role -->|no| deny
```

## 12. Entity relationship

```mermaid
erDiagram
  users ||--o| profiles : has
  users ||--o| preferences : has
  users ||--o| privacy_settings : has
  users ||--o{ user_hobbies : selects
  hobbies ||--o{ user_hobbies : listed
  users ||--o{ quiz_answers : answers
  users ||--o{ matches : views
  users ||--o{ connection_requests : sends
  users ||--o{ messages : sends
  users ||--o{ reports : files
  users ||--o{ blocks : blocks
  users ||--o{ activity_feedback : records
  users ||--o{ login_verifications : verifies
  users ||--o{ otp_codes : receives
  users ||--o{ user_sessions : opens
  users ||--o{ video_calls : joins
  users ||--o{ admin_audit_logs : performs
  ml_model_versions ||--o{ activity_feedback : trained_from
```

`ml_model_versions` does not have a foreign key to individual feedback rows. The last relationship means training reads that table. It is not a database constraint.

---

## 13. Phase 19 Secure profile photo access control

```mermaid
flowchart TD
  req[GET /media/profile-photos/:filename]
  checkRegex{Filename matches UUID.webp?}
  checkExists{File exists on disk?}
  checkSigned{Valid exp and HMAC sig?}
  checkBearer{Bearer token present?}
  checkOwner{Requester is photo owner or admin?}
  checkBlock{Block exists either way?}
  checkPrivacy{Owner privacy setting?}

  req --> checkRegex
  checkRegex -->|No| r400[400 Invalid media key]
  checkRegex -->|Yes| checkExists
  checkExists -->|No| r404[404 Profile photo not found]
  checkExists -->|Yes| checkSigned
  checkSigned -->|Yes| serve[200 Serve WebP image]
  checkSigned -->|Expired/Bad Sig| r403Sig[403 Invalid or expired signed URL]
  checkSigned -->|No sig/exp| checkBearer
  checkBearer -->|Yes| checkOwner
  checkOwner -->|Yes| serve
  checkOwner -->|No| checkBlock
  checkBlock -->|Yes| r403Block[403 Access denied]
  checkBlock -->|No| checkPrivacy
  checkPrivacy -->|everyone, signed-in member| serve
  checkPrivacy -->|connections and accepted| serve
  checkPrivacy -->|connections, not accepted| r403Conn[403 Visible to connections only]
  checkPrivacy -->|nobody| r403Private[403 Access denied]
  checkBearer -->|No token| r401[401 Sign in to view this photo]
```

A valid signature is a short-lived capability (10 minutes by default) minted after an API response has already applied privacy. It is not a permanent public URL. "everyone" means any signed-in member, which matches the settings label "All members". There is no separate `members` level. Anonymous access without a signature is refused.

## 14. Phase 19 Multi-channel OTP delivery architecture

```mermaid
flowchart LR
  client[Registration or Login OTP Request]
  service[otpService.js: Rate limits, CSPRNG code, HMAC hash]
  router[productionOtpProvider.js: Channel router]
  dev[devOtpProvider: Memory outbox]
  smtp[smtpProvider.js: SMTP socket transport]
  twilio[twilioProvider.js: Twilio REST API]

  client --> service
  service -->|OTP_PROVIDER=dev| dev
  service -->|OTP_PROVIDER=smtp| smtp
  service -->|OTP_PROVIDER=twilio| twilio
  service -->|OTP_PROVIDER=production| router
  router -->|channel=email| smtp
  router -->|channel=mobile| twilio
```

`OTP_PROVIDER=dev` is refused when `NODE_ENV=production`. The SMTP and Twilio adapters were not exercised against a live provider.

## 15. Phase 19 WebRTC TURN Relay & Ephemeral Credential Flow

```mermaid
sequenceDiagram
  participant B as Browser Client
  participant A as API (Express)
  participant T as TURN Relay Server (coturn)
  participant P as Peer Browser

  B->>A: GET /api/v1/calls/ice-servers (Bearer JWT)
  Note over A: Reads WEBRTC_TURN_SECRET (never sent to client)<br/>Mints expiry = now + 3600<br/>username = expiry:userId<br/>credential = base64(HMAC-SHA1(secret, username))
  A-->>B: { iceServers: [STUN, TURN with username & credential], relay: true }
  B->>B: new RTCPeerConnection({ iceServers })
  B->>A: Socket.IO: call_offer / answer / ice_candidate
  A->>P: Relays signalling over authenticated Socket.IO
  alt Direct P2P Path Succeeds (Host / Server Reflexive)
    B<<-->>P: Direct SRTP media
  else Symmetric NAT / Firewall Blocks Direct P2P
    B->>T: Connect via ephemeral TURN credentials
    P->>T: Connect via ephemeral TURN credentials
    B<<-->>T: Relayed SRTP media
    T<<-->>P: Relayed SRTP media
  end
```

This path runs only when `WEBRTC_TURN_URL` and a secret or static credential are set. In the audited development environment the response is STUN only and `relay` is false. No coturn process was running.

