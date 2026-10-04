import PagePlaceholder from '../../components/common/PagePlaceholder.jsx';
import ApiStatus from '../../components/common/ApiStatus.jsx';
import useAuth from '../../hooks/useAuth.js';

function AdminDashboard() {
  const { user, logout } = useAuth();

  return (
    <PagePlaceholder
      title="Admin dashboard"
      description={`Signed in as ${user?.email || user?.mobile}. User management, reports and moderation tools will appear here.`}
    >
      <ApiStatus />
      <div className="actions">
        <button type="button" className="btn" onClick={logout}>
          Log out
        </button>
      </div>
    </PagePlaceholder>
  );
}

export default AdminDashboard;
