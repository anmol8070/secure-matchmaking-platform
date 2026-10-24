import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import { ADMIN_PATHS, USER_PATHS } from '../routes/paths.js';

/** Unknown URL — shown inside the user or admin layout so navigation stays available. */
function NotFound() {
  const { isAuthenticated, isAdmin } = useAuth();
  const target = isAdmin
    ? { to: ADMIN_PATHS.DASHBOARD, label: 'Go to the admin dashboard' }
    : isAuthenticated
      ? { to: USER_PATHS.DASHBOARD, label: 'Go to your dashboard' }
      : { to: USER_PATHS.HOME, label: 'Back to home' };

  return (
    <section className="card card--narrow">
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist or has moved.</p>
      <Link to={target.to} className="btn btn--primary">
        {target.label}
      </Link>
    </section>
  );
}

export default NotFound;
