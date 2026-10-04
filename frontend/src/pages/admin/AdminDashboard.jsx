import PagePlaceholder from '../../components/common/PagePlaceholder.jsx';
import ApiStatus from '../../components/common/ApiStatus.jsx';

function AdminDashboard() {
  return (
    <PagePlaceholder
      title="Admin dashboard"
      description="User management, reports and moderation tools will appear here."
    >
      <ApiStatus />
    </PagePlaceholder>
  );
}

export default AdminDashboard;
