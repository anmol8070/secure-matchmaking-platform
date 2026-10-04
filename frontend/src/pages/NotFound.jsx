import { Link } from 'react-router-dom';
import { USER_PATHS } from '../routes/paths.js';

function NotFound() {
  return (
    <main className="content content--center">
      <section className="card">
        <h1>Page not found</h1>
        <p className="muted">The page you are looking for does not exist.</p>
        <Link to={USER_PATHS.HOME} className="btn btn--primary">
          Back to home
        </Link>
      </section>
    </main>
  );
}

export default NotFound;
