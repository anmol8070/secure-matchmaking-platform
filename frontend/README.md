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

| Panel | Path               | Page                     |
| ----- | ------------------ | ------------------------ |
| User  | `/`                | Landing / Home           |
| User  | `/register`        | Registration             |
| User  | `/verify-otp`      | OTP Verification         |
| User  | `/login`           | Login                    |
| Admin | `/admin`           | Redirects to dashboard   |
| Admin | `/admin/login`     | Admin Login              |
| Admin | `/admin/dashboard` | Admin Dashboard          |

Paths are defined once in `src/routes/paths.js`. User pages render inside `UserLayout`; admin pages render inside `AdminLayout`.

## Structure

```
src/
├── components/   Reusable UI (components/common/…)
├── pages/        user/ and admin/ page components
├── layouts/      UserLayout, AdminLayout
├── routes/       AppRoutes.jsx, paths.js
├── services/     apiClient.js and per-resource API modules
├── hooks/        Custom hooks (e.g. useApiHealth)
├── utils/        Constants and helpers
├── assets/       Images, icons
├── styles/       Global CSS
└── App.jsx
```

## Rules

- Components do not call `fetch` directly. They use hooks, and the hooks call `services/`.
- No business logic (matching, scoring, validation rules) lives in React components. The UI displays results returned by the API.
- Only `VITE_`-prefixed variables are bundled into the browser. Never put secrets or database credentials in `frontend/.env`.
