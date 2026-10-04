# Frontend — Matchmaking Platform

React (Vite) single-page app containing both the **User panel** and the **Admin panel**. See the [root README](../README.md) for the full project overview.

## Setup

```bash
cd frontend
npm install
cp .env.example .env     # set VITE_API_BASE_URL if the API is not on localhost:5000
npm run dev              # http://localhost:5173
```

## Scripts

| Script            | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start the dev server              |
| `npm run build`   | Production build to `dist/`       |
| `npm run preview` | Serve the production build        |
| `npm test`        | Run Vitest + Testing Library      |

## Routes

| Panel | Path                  | Access                          | Page |
| ----- | --------------------- | ------------------------------- | ---- |
| User  | `/`                   | Public                          | Landing / Home |
| User  | `/register`           | Visitors                        | Registration (email/mobile + password) |
| User  | `/otp-verification`   | Visitors                        | Account verification with OTP (resend with cooldown) |
| User  | `/login`              | Visitors                        | Login with password **or** OTP |
| User  | `/login-verification` | After credentials/OTP succeeded | **Live camera face-presence check** (`LoginVerification.jsx`) |
| User  | `/dashboard`          | Signed in                       | Dashboard |
| User  | `/profile`            | Signed in                       | View own profile (redirects to create when missing) |
| User  | `/profile/create`     | Signed in                       | Complete profile + optional picture |
| User  | `/profile/edit`       | Signed in                       | Edit profile and picture |
| User  | `/preferences`, `/matches`, `/connections`, `/messages` | Signed in | Placeholders (later phases) |
| Admin | `/admin/login`        | Visitors                        | Admin login (then live verification) |
| Admin | `/admin/dashboard`    | Signed-in admins                | Admin dashboard (placeholder) |

Paths are defined once in `src/routes/paths.js`. Access rules live in `src/routes/guards.jsx` (`ProtectedRoute`, `AdminRoute`, `VerificationRoute`, `GuestRoute`).

## Authentication

- **One central state:** `src/context/AuthContext.jsx` + `authReducer.js`, read through `useAuth()`. The states are: logged out, authentication pending, credentials verified, live verification pending, fully authenticated, and session expired. Components never keep their own copy.
- **Two-step login:** the password/OTP step returns a temporary verification token, kept in memory only. The access token is received only after live verification, and is stored in `sessionStorage` (`services/tokenStore.js`).
- **Bearer header:** `apiClient` adds `Authorization: Bearer …` to requests made with `{ auth: true }`. A 401 moves the app to *session expired*.
- **Live verification:** `hooks/useCamera.js` handles `getUserMedia` and every error case (permission denied, no camera, camera busy, unsupported or insecure browser). `services/faceDetectionService.js` counts faces with MediaPipe's BlazeFace model in the browser.
  - Only `{ face_detected, face_count, confidence, detector }` is sent to the API.
  - The captured frame is cleared immediately and is never uploaded or used as a profile picture.
- **Detector files:** the MediaPipe runtime and model load from public CDNs on first use. Override them with `VITE_MEDIAPIPE_WASM_URL` / `VITE_FACE_DETECTOR_MODEL_URL` to self-host. The camera needs HTTPS (or localhost).
- **Development only:** the "Show development OTP" button (`components/auth/DevOtpHint.jsx`, `services/devService.js`) reads the backend's dev OTP outbox. Vite removes it from production builds.

## Profile (Phase 5)

- **Pages:** `pages/user/profile/` (`ProfilePage`, `ProfileCreate`, `ProfileEdit`).
- **Components:** `components/profile/` (`ProfileView`, `ProfileForm`, `ProfilePhotoUploader`, `Avatar`).
- **Data:** `hooks/useOwnProfile.js` and `services/profileService.js`.
- **Picture sources:** the gallery or file picker, or **Take a photo**, which uses the in-page camera via `useCamera` (or the phone's native camera). Any image is accepted, and **no face detection** runs.
- **Upload format:** pictures are sent as `multipart/form-data`; `apiClient` sends `FormData` as-is.
- **Client-side checks** (type, size, required fields, age range) are for convenience only; the API validates again. Keep `VITE_PROFILE_IMAGE_MAX_SIZE_MB` equal to the backend limit.

## Structure

```
src/
├── components/   Reusable UI (common/, auth/)
├── pages/        user/ and admin/ page components
├── layouts/      UserLayout, AdminLayout
├── routes/       AppRoutes.jsx, guards.jsx, paths.js
├── services/     apiClient, authService, tokenStore, faceDetectionService, devService
├── context/      AuthContext + authReducer (central auth state)
├── hooks/        useAuth, useCamera, useApiHealth
├── utils/        Constants and helpers
├── assets/       Images, icons
├── styles/       Global CSS
└── App.jsx
```

## Rules

- Components do not call `fetch` directly. They use hooks, and the hooks call `services/`.
- No business logic (matching, scoring, validation rules) lives in React components. The UI displays results returned by the API.
- Only `VITE_`-prefixed variables are bundled into the browser. Never put secrets or database credentials in `frontend/.env`.
