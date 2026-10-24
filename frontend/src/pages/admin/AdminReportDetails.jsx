/**
 * Report review (Phase 14). Shows the report, the two accounts involved and
 * the review history. Decisions: mark under review → resolve / dismiss, with
 * a note and the action taken. Suspending the reported account is a
 * separate, explicit step on the user page (linked to this report) — a
 * report never changes an account by itself. No private messages or call
 * content are shown.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { adminService } from '../../services/adminService.js';
import { ADMIN_PATHS, adminUserPath } from '../../routes/paths.js';
import { AsyncState, StatusBadge, formatDate, label } from '../../components/admin/AdminParts.jsx';

const NEXT = {
  pending: ['under_review', 'resolved', 'dismissed'],
  under_review: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};
const BUTTONS = { under_review: 'Mark under review', resolved: 'Resolve', dismissed: 'Dismiss' };

function Person({ title, person, userId }) {
  return (
    <div className="details__row">
      <dt>{title}</dt>
      <dd>
        <Link to={adminUserPath(userId)}>{person?.name || `User ${userId}`}</Link> · #{userId}
        {person?.email && <span className="muted"> · {person.email}</span>}
        {person && (
          <>
            {' '}
            <StatusBadge status={person.status} />
          </>
        )}
      </dd>
    </div>
  );
}

function AdminReportDetails() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setLoading(true);
    adminService
      .getReport(id)
      .then((res) => {
        setReport(res.data.report);
        setError(null);
      })
      .catch((err) => setError(err.status === 404 ? 'Report not found.' : err.message || 'Unable to load this report.'))
      .finally(() => setLoading(false));
  }, [id]);

  const decide = async (status) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await adminService.setReportStatus(id, {
        status,
        ...(note.trim() && { resolutionNote: note.trim() }),
        ...(actionTaken && status !== 'under_review' && { actionTaken }),
      });
      setReport(res.data.report);
      setNotice(`Report marked as ${label(status).toLowerCase()}.`);
      setNote('');
    } catch (err) {
      setActionError(err.message || 'Unable to update the report.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const options = report ? NEXT[report.status] : [];

  return (
    <section className="admin-page">
      <p>
        <Link to={ADMIN_PATHS.REPORTS}>&lt; All reports</Link>
      </p>
      <AsyncState loading={loading} error={error}>
        {report && (
          <>
            <header className="admin-page__header">
              <h1>Report #{report.id}</h1>
              <StatusBadge status={report.status} />
            </header>

            <section className="card">
              <dl className="details">
                <div className="details__row">
                  <dt>Reason</dt>
                  <dd>{report.reasonLabel}</dd>
                </div>
                <div className="details__row">
                  <dt>Description</dt>
                  <dd className="admin-text">{report.description || <span className="muted">None given</span>}</dd>
                </div>
                <Person title="Reported user" person={report.reportedUser} userId={report.reportedUserId} />
                <div className="details__row">
                  <dt>Open reports about them</dt>
                  <dd className="num">{report.reportedUserOpenReports ?? '—'}</dd>
                </div>
                <Person title="Reporter" person={report.reporter} userId={report.reporterId} />
                <div className="details__row">
                  <dt>Submitted</dt>
                  <dd>{formatDate(report.createdAt)}</dd>
                </div>
                {report.reviewedAt && (
                  <div className="details__row">
                    <dt>Last reviewed</dt>
                    <dd>{formatDate(report.reviewedAt)}</dd>
                  </div>
                )}
                {report.actionTaken && (
                  <div className="details__row">
                    <dt>Action taken</dt>
                    <dd>{label(report.actionTaken)}</dd>
                  </div>
                )}
                {report.resolutionNote && (
                  <div className="details__row">
                    <dt>Note</dt>
                    <dd className="admin-text">{report.resolutionNote}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="card admin-actions" aria-label="Review">
              <h2>Review</h2>
              <Alert type="success">{notice}</Alert>
              <Alert type="error">{actionError}</Alert>
              {options.length === 0 ? (
                <p className="muted">This report is closed.</p>
              ) : (
                <div className="stack">
                  <div className="field">
                    <label htmlFor="report-note">Note (recorded with the decision)</label>
                    <textarea id="report-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="report-action">Action taken (for resolve/dismiss)</label>
                    <select id="report-action" value={actionTaken} onChange={(e) => setActionTaken(e.target.value)}>
                      <option value="">Not specified</option>
                      <option value="none">No action needed</option>
                      <option value="warning">Warning given</option>
                      <option value="suspended">Account suspended</option>
                    </select>
                  </div>
                  <div className="actions">
                    {options.map((status) => (
                      <button key={status} type="button" className={`btn${status === 'resolved' ? ' btn--primary' : ''}`} disabled={busy} onClick={() => decide(status)}>
                        {BUTTONS[status]}
                      </button>
                    ))}
                  </div>
                  {report.reportedUser?.status === 'active' && report.reportedUser?.role !== 'admin' && (
                    <p className="muted">
                      To suspend the reported account, use{' '}
                      <Link to={`${adminUserPath(report.reportedUserId)}?report=${report.id}`}>the account page</Link> — the suspension is
                      linked to this report in the audit log.
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="card">
              <h2>Review history</h2>
              {report.history.length === 0 ? (
                <p className="muted">No decisions yet.</p>
              ) : (
                <ul className="admin-history">
                  {report.history.map((h) => (
                    <li key={h.id}>
                      <strong>
                        {label(h.metadata?.from)} → {label(h.metadata?.to)}
                      </strong>{' '}
                      · {formatDate(h.createdAt)} · {h.adminEmail || `admin ${h.adminId}`}
                      {h.metadata?.actionTaken && ` · ${label(h.metadata.actionTaken)}`}
                      {h.reason && <span className="admin-text"> — {h.reason}</span>}
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

export default AdminReportDetails;
