/**
 * Asks for a reason before a block is sent. Closing or cancelling does nothing.
 */
import { useRef, useState } from 'react';
import useDialog from '../../hooks/useDialog.js';
import { BLOCK_REASONS, safetyService } from '../../services/safetyService.js';

function BlockDialog({ user, onClose, onBlocked }) {
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);
  const dialogRef = useDialog(onClose);

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!reason) {
      setError('Choose a reason to block this person.');
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      await safetyService.blockUser(user.userId, reason);
      onBlocked?.();
    } catch (err) {
      setError(err.message || 'Unable to block this user.');
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="dialog card" role="dialog" aria-modal="true" aria-labelledby="block-title" tabIndex={-1}>
        <h2 id="block-title">Block {user.name}</h2>
        <form className="stack" onSubmit={submit} noValidate>
          <p className="muted">
            You will no longer see each other, your connection will end, and they cannot message, call or send you requests.
          </p>
          <div className="field">
            <label htmlFor="block-reason">Reason</label>
            <select id="block-reason" value={reason} onChange={(event) => setReason(event.target.value)} required>
              <option value="">Choose a reason…</option>
              {BLOCK_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="btn btn--danger" disabled={sending}>
              {sending ? 'Blocking…' : 'Block'}
            </button>
            <button type="button" className="btn" onClick={onClose} disabled={sending}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BlockDialog;
