/**
 * Blocked users (Phase 13) — /privacy/blocked. Shows only what any member may
 * see of each person (their public fields). Unblocking does not restore a
 * connection: to talk again, a new connection request is needed.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import { BLOCK_REASONS, safetyService } from '../../services/safetyService.js';
import { USER_PATHS } from '../../routes/paths.js';

function BlockedUsers() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const notify = useToast();
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    safetyService
      .listBlocks()
      .then((res) => setBlocks(res.data.blocks || []))
      .catch((err) => setError(err.message || 'Unable to load blocked users.'))
      .finally(() => setLoading(false));
  }, []);

  const unblock = async (block) => {
    if (inFlight.current) return;
    const name = block.user?.name || 'this user';
    if (!window.confirm(`Unblock ${name}? They will be able to find you and send you a connection request again.`)) return;
    inFlight.current = true;
    setBusyId(block.userId);
    setError(null);
    try {
      await safetyService.unblockUser(block.userId);
      setBlocks((current) => current.filter((b) => b.userId !== block.userId));
      notify(`${name} has been unblocked.`);
    } catch (err) {
      setError(err.message || 'Unable to unblock this user.');
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  };

  return (
    <section className="card">
      <h1>Blocked users</h1>
      <p className="muted">
        Blocked people cannot see your profile, contact you, call you or send you connection requests — and neither can you with them.{' '}
        <Link to={USER_PATHS.PRIVACY}>Privacy settings</Link>
      </p>
      <Alert type="error">{error}</Alert>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : blocks.length === 0 ? (
        !error && <p className="muted">You have not blocked anyone.</p>
      ) : (
        <ul className="person-list" aria-label="Blocked users">
          {blocks.map((block) => (
            <li key={block.userId} className="person-card">
              <Avatar src={block.user?.profilePicture} name={block.user?.name} size="small" />
              <div className="person-card__body">
                <h3>{block.user?.name || 'Unavailable user'}</h3>
                <p className="muted">Blocked {new Date(block.blockedAt).toLocaleDateString()}</p>
                {block.reason && (
                  <p className="muted">{BLOCK_REASONS.find((item) => item.value === block.reason)?.label || block.reason}</p>
                )}
                <p className="muted">Blocked {new Date(block.blockedAt).toLocaleDateString()}</p>
              </div>
              <div className="person-card__actions">
                <button type="button" className="btn btn--small" disabled={busyId === block.userId} onClick={() => unblock(block)}>
                  {busyId === block.userId ? 'Unblocking…' : 'Unblock'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default BlockedUsers;
