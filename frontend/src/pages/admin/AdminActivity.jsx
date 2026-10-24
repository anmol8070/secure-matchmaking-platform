/**
 * Activity (Phase 14): daily counts from recorded events (small multiples,
 * one chart per series), a table view of the same numbers, and the admin
 * audit log. Counts only — no personal data and no message content.
 */
import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService.js';
import ActivityChart from '../../components/admin/ActivityChart.jsx';
import { AsyncState, Pagination, RangePresets, formatDate, label, rangeForDays } from '../../components/admin/AdminParts.jsx';

const SERIES = [
  ['registrations', 'Registrations'],
  ['connectionRequests', 'Connection requests'],
  ['acceptedConnections', 'Accepted connections'],
  ['messages', 'Messages'],
  ['calls', 'Video calls'],
  ['reportsSubmitted', 'Reports submitted'],
  ['reportsClosed', 'Reports closed'],
];

function AuditLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminService
      .listAuditLogs({ page, limit: 20 })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Unable to load the audit log.'));
  }, [page]);

  return (
    <section className="card">
      <h2>Admin audit log</h2>
      <AsyncState loading={!data && !error} error={error} empty={data && data.entries.length === 0} emptyText="No admin actions recorded yet.">
        {data && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Admin</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Reason / details</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.createdAt)}</td>
                    <td>{e.adminEmail || (e.adminId ? `#${e.adminId}` : 'Removed admin')}</td>
                    <td>{label(e.action)}</td>
                    <td>
                      {e.targetType} {e.targetId ? `#${e.targetId}` : ''}
                    </td>
                    <td className="admin-text">
                      {e.reason || ''}
                      {e.metadata?.from && ` (${label(e.metadata.from)} → ${label(e.metadata.to)})`}
                      {e.metadata?.outcome && ` (${label(e.metadata.outcome)})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncState>
      <Pagination pagination={data?.pagination} onPage={setPage} />
    </section>
  );
}

function AdminActivity() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('charts');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService
      .getActivity(rangeForDays(days))
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message || 'Unable to load activity.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>Activity</h1>
      </header>
      <div className="admin-filters">
        <RangePresets days={days} onChange={setDays} />
        <div role="group" aria-label="View">
          <button type="button" className={`btn btn--small${view === 'charts' ? ' btn--primary' : ''}`} aria-pressed={view === 'charts'} onClick={() => setView('charts')}>
            Charts
          </button>
          <button type="button" className={`btn btn--small${view === 'table' ? ' btn--primary' : ''}`} aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Table
          </button>
        </div>
      </div>

      <AsyncState loading={loading && !data} error={error}>
        {data &&
          (view === 'charts' ? (
            <div className={`activity-grid${loading ? ' is-refreshing' : ''}`}>
              {SERIES.map(([key, title]) => (
                <ActivityChart key={key} title={title} days={data.days} values={data.series[key]} />
              ))}
            </div>
          ) : (
            <div className={`admin-table-wrap${loading ? ' is-refreshing' : ''}`}>
              <table className="admin-table">
                <caption className="visually-hidden">Daily activity</caption>
                <thead>
                  <tr>
                    <th scope="col">Day (UTC)</th>
                    {SERIES.map(([key, title]) => (
                      <th scope="col" key={key}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day, i) => (
                    <tr key={day}>
                      <td>{day}</td>
                      {SERIES.map(([key]) => (
                        <td key={key} className="num">
                          {data.series[key][i]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {SERIES.map(([key]) => (
                      <td key={key} className="num">
                        {data.totals[key]}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
      </AsyncState>

      <AuditLog />
    </section>
  );
}

export default AdminActivity;
