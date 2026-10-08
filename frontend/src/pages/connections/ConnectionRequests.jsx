/**
 * Connection requests (Phase 10): requests received (accept / reject) and
 * requests sent (cancel while pending). Lists always come from the backend
 * and are reloaded after every action.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import { connectionService } from '../../services/connectionService.js';
import { USER_PATHS } from '../../routes/paths.js';

const TABS = [
  { id: 'received', label: 'Received', load: connectionService.getReceivedRequests, person: 'sender' },
  { id: 'sent', label: 'Sent', load: connectionService.getSentRequests, person: 'receiver' },
];

const ACTION_MESSAGES = {
  accept: 'Connection request accepted.',
  reject: 'Connection request rejected.',
  cancel: 'Connection request cancelled.',
};

const STATUS_LABELS = { pending: 'Pending', rejected: 'Declined' };

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '');

function ConnectionRequests() {
  const [tab, setTab] = useState('received');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);

  const active = TABS.find((t) => t.id === tab);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await active.load();
      setRequests(res.data?.requests || []);
    } catch (err) {
      setError(err.message || 'Unable to load connection requests.');
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (id, action) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      await connectionService.updateConnectionRequest(id, action);
      setNotice(ACTION_MESSAGES[action]);
    } catch (err) {
      setError(err.message || 'Unable to process request.');
    } finally {
      inFlight.current = false;
      setBusyId(null);
      await load();
    }
  };

  const switchTab = (id) => {
    setNotice(null);
    setError(null);
    setTab(id);
  };

  return (
    <section className="card">
      <h1>Connection requests</h1>
      <p className="muted">
        People who want to connect with you, and requests you have sent. See your{' '}
        <Link to={USER_PATHS.CONNECTIONS}>connections</Link>.
      </p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Alert type="success">{notice}</Alert>
      <Alert type="error">{error}</Alert>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : requests.length === 0 ? (
        !error && <p className="muted">{tab === 'received' ? 'No connection requests yet.' : 'You have not sent any pending requests.'}</p>
      ) : (
        <ul className="person-list" aria-label={`${active.label} requests`}>
          {requests.map((req) => {
            const person = req[active.person];
            const busy = busyId === req.id;
            return (
              <li key={req.id} className="person-card">
                <Avatar src={person.profilePicture} name={person.name} size="small" />
                <div className="person-card__body">
                  <h3>
                    {person.name}
                    {person.age ? `, ${person.age}` : ''}
                  </h3>
                  {person.location && <p className="muted">{person.location}</p>}
                  <p className="muted">
                    {tab === 'received' ? 'Received' : 'Sent'} {formatDate(req.createdAt)}
                    {tab === 'sent' && (
                      <>
                        {' · '}
                        <span className="status-pill">{STATUS_LABELS[req.status] || req.status}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="person-card__actions">
                  <Link className="btn btn--small" to={`${USER_PATHS.MATCHES}?view=${person.userId}`}>
                    View Profile
                  </Link>
                  {tab === 'received' && (
                    <>
                      <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => respond(req.id, 'accept')}>
                        Accept
                      </button>
                      <button type="button" className="btn btn--small" disabled={busy} onClick={() => respond(req.id, 'reject')}>
                        Reject
                      </button>
                    </>
                  )}
                  {tab === 'sent' && req.status === 'pending' && (
                    <button type="button" className="btn btn--small" disabled={busy} onClick={() => respond(req.id, 'cancel')}>
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ConnectionRequests;
