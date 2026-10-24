/**
 * Call history (Phase 12) — /calls. Only calls the signed-in user took part
 * in, from the backend; metadata only.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import { callService } from '../../services/callService.js';
import { USER_PATHS, chatPath } from '../../routes/paths.js';

const STATUS_LABELS = {
  ended: 'Completed',
  missed: 'Missed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
  busy: 'Busy',
  failed: 'Failed',
  ringing: 'Ringing',
  accepted: 'Connecting',
  connected: 'In progress',
};

const duration = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : null);

function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (before) => {
    setLoading(true);
    try {
      const res = await callService.getHistory({ before });
      setCalls((current) => (before ? [...current, ...res.data.calls] : res.data.calls));
      setCursor(res.data.pagination.hasMore ? res.data.pagination.nextCursor : null);
    } catch (err) {
      setError(err.message || 'Unable to load call history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="card">
      <h1>Call history</h1>
      <Alert type="error">{error}</Alert>
      {!loading && !error && calls.length === 0 && (
        <p className="muted">
          No calls yet. Start one from a chat with one of your <Link to={USER_PATHS.CONNECTIONS}>connections</Link>.
        </p>
      )}
      {calls.length > 0 && (
        <ul className="person-list" aria-label="Calls">
          {calls.map((call) => (
            <li key={call.id} className="person-card">
              <Avatar src={call.otherUser?.profilePicture} name={call.otherUser?.name} size="small" />
              <div className="person-card__body">
                <h3>{call.otherUser?.name || 'Unavailable user'}</h3>
                <p className="muted">
                  {call.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} · {new Date(call.createdAt).toLocaleString()}
                  {duration(call.durationSeconds) && ` · ${duration(call.durationSeconds)}`}
                </p>
              </div>
              <div className="person-card__actions">
                <span className="status-pill">{STATUS_LABELS[call.status] || call.status}</span>
                {call.otherUser && (
                  <Link className="btn btn--small" to={chatPath(call.otherUser.userId)}>
                    Chat
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {loading && <p className="muted">Loading…</p>}
      {cursor && !loading && (
        <button type="button" className="btn" onClick={() => load(cursor)}>
          Load more
        </button>
      )}
    </section>
  );
}

export default CallHistory;
