import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import useOwnProfile from '../../hooks/useOwnProfile.js';
import Avatar from '../../components/profile/Avatar.jsx';
import { USER_PATHS } from '../../routes/paths.js';

/** Landing page after a completed login. */
function Dashboard() {
  const { user, logout } = useAuth();
  const { status, profile } = useOwnProfile();

  return (
    <div className="stack">
      <section className="card">
        <h1>Welcome{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
        <p className="muted">You are signed in and verified.</p>
        <dl className="details">
          <dt>Email</dt>
          <dd>{user?.email || '—'}</dd>
          <dt>Mobile</dt>
          <dd>{user?.mobile || '—'}</dd>
          <dt>Account status</dt>
          <dd>{user?.status}</dd>
        </dl>
        <div className="actions">
          <button type="button" className="btn" onClick={logout}>
            Log out
          </button>
        </div>
      </section>

      {status === 'missing' && (
        <section className="card callout">
          <h2>Complete your profile</h2>
          <p className="muted">Add your details and a picture so others can get to know you.</p>
          <Link to={USER_PATHS.PROFILE_CREATE} className="btn btn--primary">
            Complete profile
          </Link>
        </section>
      )}

      {status === 'ready' && (
        <section className="card profile-summary">
          <Avatar src={profile.profilePhotoUrl} name={profile.name} size="small" />
          <div>
            <h2>Your profile</h2>
            <p className="muted">{profile.profileCompletion.percentage}% complete</p>
          </div>
          <Link to={USER_PATHS.PROFILE} className="btn">
            View profile
          </Link>
        </section>
      )}

      <p className="badge">Matches, connections and messages arrive in later phases</p>
    </div>
  );
}

export default Dashboard;
