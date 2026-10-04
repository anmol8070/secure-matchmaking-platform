export const APP_NAME = 'Matchmaking Platform';

// Public, non-secret config only. Set via VITE_API_BASE_URL in frontend/.env.
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'
).replace(/\/+$/, '');
