/**
 * Admin dashboard (Phase 14): real aggregate counts from GET /admin/dashboard
 * and platform health from GET /admin/monitoring. Nothing is hard-coded.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/adminService.js';
import { ADMIN_PATHS } from '../../routes/paths.js';
import { AdminStatCard, AsyncState, RangePresets, rangeForDays } from '../../components/admin/AdminParts.jsx';

function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([adminService.getDashboard(rangeForDays(days)), adminService.getMonitoring()])
      .then(([dashboard, monitoring]) => {
        if (cancelled) return;
        setStats(dashboard.data);
        setHealth(monitoring.data);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message || 'Unable to load the dashboard.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>Dashboard</h1>
        <RangePresets days={days} onChange={setDays} />
      </header>

      <AsyncState loading={loading && !stats} error={error}>
        {stats && (
          <div className={loading ? 'is-refreshing' : undefined}>
            <h2 className="admin-section-title">Users</h2>
            <div className="admin-stats">
              <AdminStatCard title="Registered users" value={stats.users.total} detail={`${stats.users.newInPeriod.toLocaleString()} new in period`} />
              <AdminStatCard title="Active" value={stats.users.active} />
              <AdminStatCard title="Suspended" value={stats.users.suspended} />
              <AdminStatCard title="Awaiting verification" value={stats.users.pendingVerification} />
            </div>

            <h2 className="admin-section-title">Reports</h2>
            <div className="admin-stats">
              <AdminStatCard title="Pending" value={stats.reports.pending} detail={<Link to={`${ADMIN_PATHS.REPORTS}?status=pending`}>Review queue</Link>} />
              <AdminStatCard title="Under review" value={stats.reports.underReview} />
              <AdminStatCard title="Resolved" value={stats.reports.resolved} />
              <AdminStatCard title="Submitted in period" value={stats.reports.submittedInPeriod} />
            </div>

            <h2 className="admin-section-title">Activity</h2>
            <div className="admin-stats">
              <AdminStatCard title="Active connections" value={stats.connections.active} detail={`${stats.connections.pendingRequests.toLocaleString()} pending requests`} />
              <AdminStatCard title="Connection requests in period" value={stats.connections.requestsInPeriod} />
              <AdminStatCard title="Messages in period" value={stats.messages.inPeriod} detail={`${stats.messages.total.toLocaleString()} in total (counts only)`} />
              <AdminStatCard title="Video calls in period" value={stats.calls.inPeriod} detail={`${stats.calls.completed.toLocaleString()} completed · ${stats.calls.missed.toLocaleString()} missed`} />
            </div>
          </div>
        )}
      </AsyncState>

      {health && (
        <section className="card admin-health" aria-label="Platform health">
          <h2>Platform health</h2>
          <dl className="details">
            <div className="details__row">
              <dt>Database</dt>
              <dd>{health.database.reachable ? `Reachable (${health.database.latencyMs} ms)` : 'Unreachable'}</dd>
            </div>
            <div className="details__row">
              <dt>Connected clients</dt>
              <dd>{health.realtime.connectedClients.toLocaleString()}</dd>
            </div>
            <div className="details__row">
              <dt>Active calls</dt>
              <dd>{health.activeCalls ?? '—'}</dd>
            </div>
            <div className="details__row">
              <dt>Uptime</dt>
              <dd>{Math.floor(health.uptimeSeconds / 3600)} h {Math.floor((health.uptimeSeconds % 3600) / 60)} min</dd>
            </div>
          </dl>
        </section>
      )}
    </section>
  );
}

export default AdminDashboard;
