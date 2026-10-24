/**
 * One account (Phase 14): account state, profile content, aggregate counts,
 * admin history, and suspend / reactivate. Never shows passwords, tokens,
 * messages or call content. The server enforces every rule; the buttons
 * only reflect them.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import useAuth from '../../hooks/useAuth.js';
import { adminService } from '../../services/adminService.js';
import { ADMIN_PATHS, adminReportPath } from '../../routes/paths.js';
import { AsyncState, StatusBadge, formatDate, label } from '../../components/admin/AdminParts.jsx';

function AdminUserDetails() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const fromReport = params.get('report'); // opened from a report review
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const inFlight = useRef(false);

  const load = () =>
    adminService
      .getUser(id)
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch((err) => setError(err.status === 404 ? 'User not found.' : err.message || 'Unable to load this user.'))
      .finally(() => setLoading(false));

  useEffect(() => {
    setLoading(true);
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (status) => {
    if (inFlight.current) return;
    if (status === 'suspended' && reason.trim().length < 3) {
      setActionError('Give a reason for the suspension (at least 3 characters).');
      return;
    }
    const verb = status === 'suspended' ? 'Suspend' : 'Reactivate';
    if (!window.confirm(`${verb} this account?${status === 'suspended' ? ' The user is signed out everywhere immediately.' : ''}`)) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await adminService.setUserStatus(id, {
        status,
        ...(reason.trim() && { reason: reason.trim() }),
        ...(fromReport && { reportId: Number(fromReport) }),
      });
      setNotice(res.message);
      setReason('');
      await load();
    } catch (err) {
      setActionError(err.message || 'Unable to change the account status.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const account = data?.user;
  const isSelf = account && me && account.userId === me.user_id;
  const isAdminAccount = account?.role === 'admin';

  return (
    <section className="admin-page">
      <p>
        <Link to={ADMIN_PATHS.USERS}>&lt; All users</Link>
      </p>
      <AsyncState loading={loading} error={error}>
        {account && (
          <>
            <header className="admin-page__header">
              {data.profile && <Avatar src={data.profile.profilePicture} name={data.profile.name} size="small" />}
              <h1>{data.profile?.name || `User ${account.userId}`}</h1>
              <StatusBadge status={account.status} />
            </header>

            <div className="admin-grid">
              <section className="card">
                <h2>Account</h2>
                <dl className="details">
                  {[
                    ['User ID', account.userId],
                    ['Email', account.email || '—'],
                    ['Mobile', account.mobile || '—'],
                    ['Role', account.role],
                    ['Email verified', account.emailVerified ? 'Yes' : 'No'],
                    ['Joined', formatDate(account.createdAt)],
                    ['Last login', formatDate(account.lastLoginAt)],
                  ].map(([k, v]) => (
                    <div className="details__row" key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="card">
                <h2>Profile</h2>
                {data.profile ? (
                  <dl className="details">
                    {[
                      ['Age', data.profile.age ?? '—'],
                      ['Gender', data.profile.gender || '—'],
                      ['Location', data.profile.location || '—'],
                      ['Education', data.profile.education || '—'],
                      ['Occupation', data.profile.occupation || '—'],
                      ['Lifestyle', data.profile.lifestyle || '—'],
                      ['About', data.profile.bio || '—'],
                      ['Completion', `${data.profile.completion?.percentage ?? 0}%`],
                    ].map(([k, v]) => (
                      <div className="details__row" key={k}>
                        <dt>{k}</dt>
                        <dd className="admin-text">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="muted">No profile created.</p>
                )}
              </section>

              <section className="card">
                <h2>Activity (counts only)</h2>
                <dl className="details">
                  {[
                    ['Connections', data.stats.connections],
                    ['Pending requests', data.stats.pendingRequests],
                    ['Reports against (open)', `${data.stats.reportsAgainst.total} (${data.stats.reportsAgainst.open})`],
                    ['Reports filed', data.stats.reportsFiled],
                    ['Blocked by users', data.stats.blockedByUsers],
                    ['Messages sent', data.stats.messagesSent],
                    ['Video calls', data.stats.calls],
                  ].map(([k, v]) => (
                    <div className="details__row" key={k}>
                      <dt>{k}</dt>
                      <dd className="num">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Link to={`${ADMIN_PATHS.REPORTS}?reportedUserId=${account.userId}`}>Reports about this user</Link>
              </section>
            </div>

            <section className="card admin-actions" aria-label="Account status">
              <h2>Account status</h2>
              <Alert type="success">{notice}</Alert>
              <Alert type="error">{actionError}</Alert>
              {fromReport && (
                <p className="muted">
                  This change will be linked to <Link to={adminReportPath(fromReport)}>report #{fromReport}</Link>.
                </p>
              )}
              {isSelf ? (
                <p className="muted">You cannot change your own account status.</p>
              ) : account.status === 'active' ? (
                isAdminAccount ? (
                  <p className="muted">Admin accounts cannot be suspended from the admin panel.</p>
                ) : (
                  <div className="stack">
                    <div className="field">
                      <label htmlFor="suspend-reason">Reason for suspension (required, recorded in the audit log)</label>
                      <textarea id="suspend-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                    <div className="actions">
                      <button type="button" className="btn btn--danger" disabled={busy} onClick={() => changeStatus('suspended')}>
                        {busy ? 'Suspending…' : 'Suspend account'}
                      </button>
                    </div>
                  </div>
                )
              ) : account.status === 'suspended' ? (
                <div className="stack">
                  <div className="field">
                    <label htmlFor="reactivate-reason">Note (optional)</label>
                    <textarea id="reactivate-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => changeStatus('active')}>
                      {busy ? 'Reactivating…' : 'Reactivate account'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="muted">A {label(account.status).toLowerCase()} account cannot be changed from the admin panel.</p>
              )}
            </section>

            <section className="card">
              <h2>Admin history</h2>
              {data.history.length === 0 ? (
                <p className="muted">No admin actions recorded for this account.</p>
              ) : (
                <ul className="admin-history">
                  {data.history.map((h) => (
                    <li key={h.id}>
                      <strong>{label(h.action)}</strong> · {formatDate(h.createdAt)} · {h.adminEmail || `admin ${h.adminId}`}
                      {h.reason && <span className="admin-text"> — {h.reason}</span>}
                      {h.metadata?.reportId && (
                        <>
                          {' '}
                          (<Link to={adminReportPath(h.metadata.reportId)}>report #{h.metadata.reportId}</Link>)
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </AsyncState>
    </section>
  );
}

export default AdminUserDetails;
