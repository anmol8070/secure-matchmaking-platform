/**
 * My connections (Phase 10): accepted connections only, loaded from the backend.
 * "Chat" leads to the Messages area that Phase 11 implements; only accepted
 * connections are offered it, and the backend enforces the same rule.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import { connectionService } from '../../services/connectionService.js';
import { USER_PATHS } from '../../routes/paths.js';
import { formatDate } from './ConnectionRequests.jsx';

function Connections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await connectionService.getConnections();
      setConnections(res.data?.connections || []);
    } catch (err) {
      setError(err.message || 'Unable to load your connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (connection) => {
    if (inFlight.current) return;
    if (!window.confirm(`Remove ${connection.user.name} from your connections?`)) return;
    inFlight.current = true;
    setBusyId(connection.connectionId);
    setNotice(null);
    setError(null);
    try {
      await connectionService.removeConnection(connection.connectionId);
      setNotice('Connection removed.');
    } catch (err) {
      setError(err.message || 'Unable to process request.');
    } finally {
      inFlight.current = false;
      setBusyId(null);
      await load();
    }
  };

  return (
    <section className="card">
      <h1>My connections</h1>
      <p className="muted">
        People you are connected with. Pending requests are on the{' '}
        <Link to={USER_PATHS.CONNECTION_REQUESTS}>connection requests</Link> page.
      </p>

      <Alert type="success">{notice}</Alert>
      <Alert type="error">{error}</Alert>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : connections.length === 0 ? (
        !error && (
          <p className="muted">
            You have no active connections. <Link to={USER_PATHS.MATCHES}>Browse your matches</Link> to send a request.
          </p>
        )
      ) : (
        <ul className="person-list" aria-label="Connections">
          {connections.map((connection) => {
            const { user } = connection;
            return (
              <li key={connection.connectionId} className="person-card">
                <Avatar src={user.profilePicture} name={user.name} size="small" />
                <div className="person-card__body">
                  <h3>
                    {user.name}
                    {user.age ? `, ${user.age}` : ''}
                  </h3>
                  {user.location && <p className="muted">{user.location}</p>}
                  <p className="muted">Connected {formatDate(connection.connectedAt)}</p>
                </div>
                <div className="person-card__actions">
                  <Link className="btn btn--small" to={`${USER_PATHS.MATCHES}?view=${user.userId}`}>
                    View Profile
                  </Link>
                  <Link className="btn btn--primary btn--small" to={`${USER_PATHS.MESSAGES}?with=${user.userId}`}>
                    Chat
                  </Link>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={busyId === connection.connectionId}
                    onClick={() => remove(connection)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default Connections;
