/**
 * "Report user" dialog (Phase 13). The reason list comes from the server;
 * submitting needs an explicit click and is ignored while in flight, so a
 * report is never sent twice by accident. The confirmation says nothing
 * about how moderators will handle it.
 */
import { useEffect, useRef, useState } from 'react';
import { safetyService } from '../../services/safetyService.js';
import useDialog from '../../hooks/useDialog.js';

const MAX_DESCRIPTION = 2000;

function ReportDialog({ user, onClose, onReported }) {
  const [reasons, setReasons] = useState([]);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const inFlight = useRef(false);
  const dialogRef = useDialog(onClose);

  useEffect(() => {
    safetyService
      .getReportReasons()
      .then((res) => setReasons(res.data.reasons))
      .catch(() => setError('Unable to load report reasons. Please try again.'));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!reason) {
      setError('Choose a reason for the report.');
      return;
    }
    if (description.length > MAX_DESCRIPTION) {
      setError(`Please keep the details under ${MAX_DESCRIPTION} characters.`);
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const res = await safetyService.reportUser({ reportedUserId: user.userId, reason, description: description.trim() });
      setDone(res.message);
      onReported?.(res.data.report);
    } catch (err) {
      setError(err.message || 'Unable to send the report. Please try again.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className="dialog card" role="dialog" aria-modal="true" aria-labelledby="report-title" tabIndex={-1}>
        <h2 id="report-title">Report {user.name}</h2>
        {done ? (
          <>
            <p role="status">{done}</p>
            <div className="actions">
              <button type="button" className="btn btn--primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form className="stack" onSubmit={submit} noValidate>
            <p className="muted">Reports are confidential. {user.name} will not be told who reported them.</p>
            <div className="field">
              <label htmlFor="report-reason">Reason</label>
              <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} required>
                <option value="">Choose a reason…</option>
                {reasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="report-description">Details (optional)</label>
              <textarea
                id="report-description"
                rows={4}
                value={description}
                maxLength={MAX_DESCRIPTION}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened?"
              />
              <small className="muted">
                {description.length}/{MAX_DESCRIPTION}
              </small>
            </div>
            {error && (
              <p className="alert alert--error" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="submit" className="btn btn--danger" disabled={sending}>
                {sending ? 'Sending…' : 'Submit report'}
              </button>
              <button type="button" className="btn" onClick={onClose} disabled={sending}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReportDialog;
