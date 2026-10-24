/**
 * Conversation list (Phase 11) — /messages. Latest message and unread count
 * per partner, from the REST API. New conversations start from Connections.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import { messageService } from '../../services/messageService.js';
import { SOCKET_EVENTS, socketService } from '../../services/socketService.js';
import { USER_PATHS, chatPath } from '../../routes/paths.js';

function Messages() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      messageService
        .getConversations()
        .then((res) => !cancelled && setConversations(res.data.conversations || []))
        .catch((err) => !cancelled && setError(err.message || 'Unable to load conversations.'))
        .finally(() => !cancelled && setLoading(false));
    load();
    // A new message moves its conversation to the top and updates the unread count.
    const off = socketService.on(SOCKET_EVENTS.MESSAGE_RECEIVED, (_message, ack) => {
      if (typeof ack === 'function') ack({ received: true });
      load();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return (
    <section className="card">
      <h1>Messages</h1>
      <Alert type="error">{error}</Alert>
      {loading ? (
        <p className="muted">Loading conversations…</p>
      ) : conversations.length === 0 ? (
        !error && (
          <p className="muted">
            No conversations yet. Open one from your <Link to={USER_PATHS.CONNECTIONS}>connections</Link>.
          </p>
        )
      ) : (
        <ul className="person-list" aria-label="Conversations">
          {conversations.map(({ conversationId, participant, lastMessage, unreadCount }) => (
            <li key={conversationId ?? participant.userId} className="person-card">
              <Avatar src={participant.profilePicture} name={participant.name} size="small" />
              <div className="person-card__body">
                <h3>{participant.name}</h3>
                <p className="muted chat__preview">
                  {lastMessage.type === 'image' ? `📷 Photo${lastMessage.message ? ` · ${lastMessage.message}` : ''}` : lastMessage.message}
                </p>
              </div>
              <div className="person-card__actions">
                {unreadCount > 0 && <span className="status-pill">{unreadCount} unread</span>}
                <Link className="btn btn--primary btn--small" to={chatPath(participant.userId)}>
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Messages;
