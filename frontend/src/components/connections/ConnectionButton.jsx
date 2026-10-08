/**
 * Connection action for another user's profile/match card.
 *
 * The relationship state is always loaded from the backend
 * (GET /connections/status/:userId) and reloaded after every action, so the
 * button never relies on local guesses:
 *
 *   none             → [Send Connection Request]
 *   pending_outgoing → [Request Pending]
 *   pending_incoming → [Accept Request] [Reject]
 *   connected        → [Connected]
 *   rejected         → [Request Declined]
 *   unavailable      → [Unavailable]   (blocked — who blocked is never shown)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { connectionService } from '../../services/connectionService.js';

const SUCCESS_MESSAGES = {
  send: 'Connection request sent.',
  accept: 'Connection request accepted.',
  reject: 'Connection request rejected.',
};

function ConnectionButton({ userId, onChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  // A ref (not state) so a second click in the same tick is ignored too.
  const inFlight = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await connectionService.getConnectionStatus(userId);
      setStatus(res.data);
    } catch (err) {
      setError(err.status === 404 ? 'This user is not available.' : 'Unable to load connection status.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadStatus();
  }, [loadStatus]);

  const run = async (kind) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (kind === 'send') await connectionService.sendConnectionRequest(userId);
      else await connectionService.updateConnectionRequest(status.connectionId, kind);
      setMessage(SUCCESS_MESSAGES[kind]);
      onChange?.(kind);
    } catch (err) {
      setError(err.message || 'Unable to process request.');
    } finally {
      // Whatever happened (e.g. 409 "already pending"), show the real state.
      await loadStatus();
      inFlight.current = false;
      setBusy(false);
    }
  };

  let content;
  if (loading) {
    content = (
      <button type="button" className="btn btn--small" disabled>
        Loading…
      </button>
    );
  } else if (!status) {
    content = null;
  } else {
    switch (status.state) {
      case 'none':
        content = (
          <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => run('send')}>
            {busy ? 'Sending…' : 'Send Connection Request'}
          </button>
        );
        break;
      case 'pending_outgoing':
        content = (
          <button type="button" className="btn btn--small" disabled>
            Request Pending
          </button>
        );
        break;
      case 'pending_incoming':
        content = (
          <>
            <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => run('accept')}>
              Accept Request
            </button>
            <button type="button" className="btn btn--small" disabled={busy} onClick={() => run('reject')}>
              Reject
            </button>
          </>
        );
        break;
      case 'connected':
        content = (
          <button type="button" className="btn btn--small" disabled>
            Connected
          </button>
        );
        break;
      case 'rejected':
        content = (
          <button type="button" className="btn btn--small" disabled>
            Request Declined
          </button>
        );
        break;
      default:
        content = (
          <button type="button" className="btn btn--small" disabled>
            Unavailable
          </button>
        );
    }
  }

  return (
    <div className="connection-button" data-state={status?.state || (loading ? 'loading' : 'error')}>
      <div className="connection-button__actions">{content}</div>
      {message && (
        <p className="connection-button__note" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="connection-button__note connection-button__note--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default ConnectionButton;
