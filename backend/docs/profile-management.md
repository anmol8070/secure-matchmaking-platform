# Profile Management

The profile module (Phase 5) covers creating, viewing and editing the signed-in user's profile and managing its profile picture. Related documents: [api-architecture.md](api-architecture.md), [authentication-flow.md](authentication-flow.md), [database-schema.md](database-schema.md).

> **The profile picture and the login verification photo are independent systems.**
>
> | | Profile picture (this module) | Login verification photo (Phase 4) |
> | --- | --- | --- |
> | Purpose | Shown on the profile | Proves a live person is present at login |
> | Source | Gallery, file picker or camera | Live camera only |
> | Face/human detection | **None.** A group photo or a photo with no face is fine | One face required (presence only) |
> | Stored | Yes: re-encoded image + URL in `profiles.profile_photo_url` | **No.** The frame stays in the browser and is discarded |
> | Compared with the other photo | **Never** | **Never** |
>
> The profile code never imports `verificationService`, and the authentication code never imports profile or storage code. Automated tests enforce this, and also scan the whole codebase for face-matching or face-recognition code.

## 1. Data model

The Phase 2 `profiles` table is reused unchanged; **no migration was needed**. Account data stays in `users`, and the profile API cannot read or change it.

| API field | Column | Notes |
| --- | --- | --- |
| `userId` (also `id`) | `user_id` | Primary key and foreign key to `users` (1:1). Always taken from the access token |
| `name` | `name` | Required |
| `dateOfBirth` | `date_of_birth` | Required, `YYYY-MM-DD` |
| `age` | — | **Computed** from `dateOfBirth` on every read; never stored |
| `gender` | `gender` | Optional |
| `city`, `state`, `country` | same | Optional |
| `location` | — | **Computed**: the non-empty parts of city, state and country joined, e.g. `"Kolhapur, Maharashtra, India"` |
| `education`, `occupation`, `lifestyle`, `bio` | same | Optional |
| `profilePhotoUrl` | `profile_photo_url` | Stored as a reference (`/media/profile-photos/<uuid>.webp`) and returned as an absolute URL |
| `profileCompletion` | — | **Computed** (section 6) |
| `createdAt`, `updatedAt` | `created_at`, `updated_at` | `updated_at` is maintained by the database |

## 2. API

Every endpoint requires `Authorization: Bearer <access token>`. Without one: `401 Authentication required`. The user is always the token's owner. **No endpoint accepts a user id for writing**, so user A can never change user B's profile.

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/profile` | — | `200` profile | `404 Profile not found. Create your profile first.` |
| POST | `/api/v1/profile` | JSON (all fields; `name`, `dateOfBirth` required) | `201 Profile created successfully` | `409` (already exists), `422` |
| PUT | `/api/v1/profile` | JSON (any subset of fields) | `200 Profile updated successfully` | `404`, `422` |
| PUT | `/api/v1/profile/photo` | `multipart/form-data`, field `photo` | `200 Profile picture updated successfully` | `404` (no profile yet), `413`, `415`, `422`, `429`, `503` |
| DELETE | `/api/v1/profile/photo` | — | `200 Profile picture removed` | `404` |
| GET | `/api/v1/profile/:userId` | — | `501` (viewing other members comes in a later phase) | `422` (invalid id) |

### Create

```http
POST /api/v1/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Asha Patil",
  "dateOfBirth": "1996-08-15",
  "gender": "female",
  "city": "Kolhapur",
  "state": "Maharashtra",
  "country": "India",
  "education": "M.Tech",
  "occupation": "Software Developer",
  "lifestyle": "Active, vegetarian",
  "bio": "Loves trekking."
}
```

### Response (all profile endpoints)

```json
{
  "success": true,
  "message": "Profile created successfully",
  "data": {
    "id": 7,
    "userId": 7,
    "name": "Asha Patil",
    "dateOfBirth": "1996-08-15",
    "age": 30,
    "gender": "female",
    "location": "Kolhapur, Maharashtra, India",
    "city": "Kolhapur",
    "state": "Maharashtra",
    "country": "India",
    "education": "M.Tech",
    "occupation": "Software Developer",
    "lifestyle": "Active, vegetarian",
    "bio": "Loves trekking.",
    "profilePhotoUrl": "http://localhost:5000/media/profile-photos/1230c4c0-4fb5-4551-87c1-a31ed7a3bb55.webp",
    "profileCompletion": { "percentage": 100, "completedFields": 9, "totalFields": 9, "missingFields": [] },
    "createdAt": "2026-10-04T07:20:00.000Z",
    "updatedAt": "2026-10-04T07:21:00.000Z"
  }
}
```

The response never contains a password, password hash, OTP, token, email, mobile, role or account status. Tests assert this for every profile endpoint.

### Update

`PUT /api/v1/profile` takes any subset of the fields. Fields that are left out are unchanged, and `null` or `""` clears an optional field. An empty body returns `422 Provide at least one profile field to update`.

### Validation errors

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "body.dateOfBirth", "message": "You must be at least 18 years old" },
    { "field": "body.name", "message": "Name is required" }
  ]
}
```

## 3. Validation and sanitisation

Requests pass through `route → requireAuth → validate(zod schema) → controller → profileService → database`. The rules live in `src/validators/profileValidator.js`.

| Field | Rules |
| --- | --- |
| `name` | Required; 2–100 characters; letters in any script, plus spaces, apostrophes, dots and hyphens; must start with a letter |
| `dateOfBirth` | Required; real calendar date `YYYY-MM-DD`; age between **18 and 100** |
| `gender` | Optional; one of `male`, `female`, `non_binary`, `other`, `prefer_not_to_say` |
| `city`, `state`, `country` | Optional; up to 100 characters; letters, spaces, apostrophes, dots, hyphens |
| `education`, `occupation` | Optional; up to 150 characters; no `<` or `>` |
| `lifestyle` | Optional; up to 100 characters; no `<` or `>` |
| `bio` | Optional; up to 2000 characters; line breaks allowed |

**Sanitisation**, applied before the rules:
- Text is normalised to Unicode NFC.
- Control characters are removed.
- In single-line fields, runs of whitespace collapse to one space and the ends are trimmed.
- In the bio, line endings are normalised and at most one blank line is kept between paragraphs.

The bio is always displayed as plain text; React escapes it, so it is never rendered as HTML.

**Unknown keys are rejected (strict schemas).** Sending `userId`, `user_id`, `role`, `status`, `password_hash`, `email`, `profile_photo_url` or any other field returns `422`. Account, security and photo data cannot be changed through these endpoints.

## 4. Profile picture upload

```
browser (gallery / file picker / camera)
   │ multipart/form-data, field "photo"
   ▼
PUT /api/v1/profile/photo
   → requireAuth → per-user upload rate limit (30 / 15 min)
   → multer (memory, size limit PROFILE_IMAGE_MAX_SIZE_MB, 1 file)
   → profilePhotoService.validateUpload:
        declared MIME ∈ {jpeg, png, webp}
        file extension ∈ {.jpg, .jpeg, .png, .webp}
        real content (magic bytes) is JPEG / PNG / WEBP
   → sharp: decode (rejects corrupt files and decompression bombs over 50 MP),
            auto-rotate, resize to fit within 1024×1024 px, encode as WEBP,
            drop all metadata (EXIF, GPS location, camera details)
   → storage.put("profile-photos/<random-uuid>.webp")
   → profiles.profile_photo_url = "/media/profile-photos/<uuid>.webp"
   → old file deleted (only after the database update succeeded)
```

| Check | Response |
| --- | --- |
| No file, or wrong form field | `422 Choose an image to upload (form field "photo").` / `400 Send one image in the "photo" form field` |
| GIF, SVG, PDF, a text file renamed to `.png`, a PNG declared as `text/plain`, a wrong extension | `415 Unsupported image type. Use a JPG, PNG or WEBP image.` |
| Larger than `PROFILE_IMAGE_MAX_SIZE_MB` | `413 Image is too large. The maximum size is 5 MB.` |
| Valid signature but the image cannot be decoded | `422 The file is not a valid image.` |
| Storage failure | `503 Could not save the image right now. Please try again.` (details only in the server log) |

**No face or human detection is performed.** Landscapes, group photos and any other suitable images are accepted.

**Replace order.** The new file is stored first, then the database is updated, then the old file is deleted. If the database update fails, the new file is deleted and the old picture stays. If deleting the old file fails, that is logged; the user is unaffected. Removing the picture sets `profile_photo_url = NULL`, then deletes the file; the profile itself is kept, and removing twice is harmless.

### Storage

`src/services/storage/` holds a pluggable storage layer, selected with `STORAGE_PROVIDER`.

**`local`** (the default, and the only provider so far):
- Files are written to `UPLOADS_DIR` (default `backend/uploads/`, git-ignored).
- They are served at `GET /media/<key>`, with `Cache-Control: public, max-age=30 days, immutable`, `Cross-Origin-Resource-Policy: cross-origin` (so the frontend origin can display them) and `nosniff`.
- Storage keys are generated by the server and checked against a strict pattern, so there is no path traversal and files are never overwritten.

**Adding cloud storage** (S3, GCS, Azure, Cloudinary…): implement `put(key, buffer, contentType) → { url }`, `remove(key)` and `keyFromUrl(url)` in a new provider file and register it. Credentials stay server-side; only the resulting URL is stored and returned.

**The database stores a reference, not the image.** The stored value is `/media/profile-photos/<uuid>.webp`. The API returns `MEDIA_PUBLIC_BASE_URL` + that path. Absolute URLs from a cloud provider are returned unchanged.

**Privacy note:** picture URLs are public but unguessable (random UUIDs). Anyone who has a URL can open it, as with most profile-image CDNs. Access-controlled delivery (signed URLs) can be added in the storage provider when member-to-member visibility rules arrive.

## 5. Frontend

| Path | Component | Purpose |
| --- | --- | --- |
| `/profile` | `pages/user/profile/ProfilePage.jsx` → `components/profile/ProfileView.jsx` | View the profile, completion bar, **Edit profile**, **Change photo**. Without a profile, redirects to `/profile/create` |
| `/profile/create` | `ProfileCreate.jsx` | "Complete your profile" form with an optional picture, uploaded right after the profile is saved |
| `/profile/edit` | `ProfileEdit.jsx` | Edit the fields (Save / Cancel); separate picture section |
| — | `components/profile/ProfileForm.jsx` | One form for create and edit, with client-side validation that mirrors the server's |
| — | `components/profile/ProfilePhotoUploader.jsx` | Gallery/file picker, **Take a photo** (in-page camera, or the native camera on phones), preview, Save, Cancel, Remove |
| — | `components/profile/Avatar.jsx` | Picture, or initials as a placeholder |

- All routes are protected; visitors are redirected to `/login`.
- The dashboard shows a "Complete your profile" prompt, or the completion percentage.
- **Client-side checks** (type, size, required fields, age range, lengths) are only for convenience; the server validates everything again.
- The camera option reuses the shared `useCamera` hook with profile-specific messages. It runs **no face detection**: the captured frame simply becomes the selected image.

## 6. Profile completion

Computed on every read and not stored. It is **not** used for matching or ranking.

There are nine fields, each worth an equal share:
- `name`
- `dateOfBirth`
- `gender`
- `location` (city, state or country)
- `education`
- `occupation`
- `lifestyle`
- `bio`
- `profilePhoto`

`percentage = round(completed / 9 × 100)`. `missingFields` lists what is still empty.

## 7. Security summary

- **Authentication:** every endpoint requires `requireAuth`. The user id comes from the token, never from the request; tests show that user A cannot change user B's profile.
- **Field allow-list:** strict schemas reject account and security fields, and only allow-listed profile columns are written.
- **Input:** validated and sanitised server-side; client-side validation is only for convenience.
- **Uploads:** size-limited, type-checked three ways (declared type, extension, real content), decoded and re-encoded, with metadata removed. Uploads are rate-limited per user.
- **Errors:** responses never include SQL, stack traces, file-system paths or storage credentials. Database and storage errors are logged server-side without file contents.
- **Responses:** never include password, hash, OTP, token, email, mobile, role or status.
- **Separation:** none of this interacts with Phase 4 verification (see the table at the top).

## 8. Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STORAGE_PROVIDER` | `local` | Storage backend |
| `UPLOADS_DIR` | `uploads` (relative to `backend/`) | Local storage folder |
| `MEDIA_PUBLIC_BASE_URL` | `http://localhost:<PORT>` | Public origin for picture URLs. **Must be an `https://` URL in production** (startup check) |
| `PROFILE_IMAGE_MAX_SIZE_MB` | `5` | Upload size limit |
| `PROFILE_IMAGE_MAX_DIMENSION` | `1024` | Longest side of the stored image (px) |
| `VITE_PROFILE_IMAGE_MAX_SIZE_MB` (frontend) | `5` | Client-side size check; keep it equal to the backend value |

## 9. Implementation decisions (not specified by the project document)

| # | Decision | Reason |
| --- | --- | --- |
| 1 | The API takes **`dateOfBirth`** and returns a computed **`age`** (the spec example sent `"age": 25`) | Phase 2 deliberately stores `date_of_birth`; a stored age goes stale every birthday |
| 2 | Location is entered as **city, state and country** and returned as a joined `location` string as well | The Phase 2 schema splits location for later matching |
| 3 | The response uses **camelCase** (as in the spec example), while auth endpoints use snake_case | Follows the Phase 5 example; `id` equals `userId` because a profile is keyed by its user |
| 4 | Separate `POST /profile` (create) and partial `PUT /profile` (update) | Clear 404/409 semantics; partial updates are safer for forms |
| 5 | The picture is uploaded with `PUT /profile/photo` after the profile exists; the create page uploads it right after saving | Keeps JSON and multipart endpoints simple and independently validated |
| 6 | Uploads are re-encoded to WEBP (max 1024 px) with **metadata stripped** | Protects users' location (EXIF GPS), bounds storage, normalises formats |
| 7 | Required fields are **name and date of birth** only | The other fields are optional and reflected in profile completion |
| 8 | `gender` is optional, with a fixed list of values | The column exists from Phase 2; useful for later preferences |
| 9 | Minimum age is 18, maximum 100 | Dating-platform norm; the spec asked for an "age range" without values |
| 10 | Local disk storage served at `/media`, with unguessable file names | The spec left the provider open; the interface allows cloud providers later |
| 11 | Per-user photo upload rate limit (30 per 15 minutes) | Image processing costs CPU |
