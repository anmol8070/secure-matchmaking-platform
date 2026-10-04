import useAuth from '../../hooks/useAuth.js';

/** Landing page after a completed login. Feature modules arrive in later phases. */
function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <section className="card">
      <h1>Welcome</h1>
      <p className="muted">You are signed in and verified.</p>
      <dl className="details">
        <dt>Email</dt>
        <dd>{user?.email || '—'}</dd>
        <dt>Mobile</dt>
        <dd>{user?.mobile || '—'}</dd>
        <dt>Account status</dt>
        <dd>{user?.status}</dd>
      </dl>
      <p className="badge">Profiles, matches, connections and messages arrive in later phases</p>
      <div className="actions">
        <button type="button" className="btn" onClick={logout}>
          Log out
        </button>
      </div>
    </section>
  );
}

export default Dashboard;
