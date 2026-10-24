/** Report queue (Phase 14): status/reason filters, sort, pagination (state in the URL). */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/adminService.js';
import { adminReportPath, adminUserPath } from '../../routes/paths.js';
import { AsyncState, Pagination, StatusBadge, formatDate } from '../../components/admin/AdminParts.jsx';

const STATUSES = ['pending', 'under_review', 'resolved', 'dismissed'];
const REASONS = ['harassment', 'spam', 'fake_profile', 'inappropriate_content', 'threatening', 'other'];

function AdminReports() {
  const [params, setParams] = useSearchParams();
  const query = {
    page: params.get('page') || 1,
    status: params.get('status') || '',
    reason: params.get('reason') || '',
    reportedUserId: params.get('reportedUserId') || '',
    sort: params.get('sort') || 'oldest',
  };
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const key = params.toString();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService
      .listReports({ ...query, limit: 20 })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message || 'Unable to load reports.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>Reports</h1>
      </header>
      <div className="admin-filters">
        <label htmlFor="report-status">Status</label>
        <select id="report-status" value={query.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <label htmlFor="report-reason">Reason</label>
        <select id="report-reason" value={query.reason} onChange={(e) => update({ reason: e.target.value })}>
          <option value="">All</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r.replace('_', ' ')}
            </option>
          ))}
        </select>
        <label htmlFor="report-sort">Order</label>
        <select id="report-sort" value={query.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
        {query.reportedUserId && (
          <button type="button" className="btn btn--small" onClick={() => update({ reportedUserId: '' })}>
            Showing user #{query.reportedUserId} · clear
          </button>
        )}
      </div>

      <AsyncState loading={loading && !data} error={error} empty={data && data.reports.length === 0} emptyText="No reports match these filters.">
        {data && (
          <div className={`admin-table-wrap${loading ? ' is-refreshing' : ''}`}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Reported user</th>
                  <th scope="col">Reporter</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r) => (
                  <tr key={r.id}>
                    <td className="num">
                      <Link to={adminReportPath(r.id)}>{r.id}</Link>
                    </td>
                    <td>
                      <Link to={adminReportPath(r.id)}>{r.reasonLabel}</Link>
                    </td>
                    <td>
                      <Link to={adminUserPath(r.reportedUserId)}>{r.reportedUser?.name || `User ${r.reportedUserId}`}</Link>
                      {r.reportedUserOpenReports > 1 && <span className="muted"> · {r.reportedUserOpenReports} open</span>}
                    </td>
                    <td>{r.reporter?.name || `User ${r.reporterId}`}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncState>
      <Pagination pagination={data?.pagination} onPage={(page) => update({ page: String(page) })} />
    </section>
  );
}

export default AdminReports;
