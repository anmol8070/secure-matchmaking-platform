/**
 * User management list (Phase 14): search, status/role filters, pagination.
 * Filters live in the URL so a list can be bookmarked or shared with another admin.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/adminService.js';
import { adminUserPath } from '../../routes/paths.js';
import { AsyncState, Pagination, StatusBadge, formatDate } from '../../components/admin/AdminParts.jsx';

const STATUSES = ['active', 'suspended', 'pending_verification', 'deactivated', 'banned'];

function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const query = { page: params.get('page') || 1, status: params.get('status') || '', role: params.get('role') || '', search: params.get('search') || '' };
  const [search, setSearch] = useState(query.search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const key = params.toString();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService
      .listUsers({ ...query, limit: 20 })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message || 'Unable to load users.'))
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
        <h1>Users</h1>
      </header>

      <form
        className="admin-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ search: search.trim() });
        }}
      >
        <label className="visually-hidden" htmlFor="user-search">
          Search users
        </label>
        <input id="user-search" type="search" placeholder="Email, mobile, name or ID" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" className="btn btn--small btn--primary">
          Search
        </button>
        <label htmlFor="user-status">Status</label>
        <select id="user-status" value={query.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <label htmlFor="user-role">Role</label>
        <select id="user-role" value={query.role} onChange={(e) => update({ role: e.target.value })}>
          <option value="">All</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </form>

      <AsyncState loading={loading && !data} error={error} empty={data && data.users.length === 0} emptyText="No users match these filters.">
        {data && (
          <div className={`admin-table-wrap${loading ? ' is-refreshing' : ''}`}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Mobile</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Open reports</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.userId}>
                    <td className="num">{u.userId}</td>
                    <td>
                      <Link to={adminUserPath(u.userId)}>{u.name || '(no profile)'}</Link>
                    </td>
                    <td>{u.email || '—'}</td>
                    <td>{u.mobile || '—'}</td>
                    <td>{u.role}</td>
                    <td>
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="num">{u.openReports}</td>
                    <td>{formatDate(u.createdAt)}</td>
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

export default AdminUsers;
