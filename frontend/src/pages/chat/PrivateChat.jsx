/**
 * Private chat with one accepted connection (Phase 11) — /chat/:userId.
 *
 * - History comes from the REST API (source of truth); the socket only
 *   brings new messages, receipts, typing and presence faster.
 * - Messages are kept in a map keyed by id, so a message that arrives via
 *   the REST response, the socket and a reconnect refetch appears once.
 * - Text is rendered as plain React text (never as HTML). Images are
 *   fetched with the access token (they are private) and captions are text.
 * - Read receipts are sent only while the tab is visible.
 * - The backend decides who may chat; this page only reflects its answer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import Icon from '../../components/common/Icon.jsx';
import ChatImage from '../../components/chat/ChatImage.jsx';
import SafetyActions from '../../components/safety/SafetyActions.jsx';
import { messageService } from '../../services/messageService.js';
import { SOCKET_EVENTS, socketService } from '../../services/socketService.js';
import { USER_PATHS, videoCallPath } from '../../routes/paths.js';

const PAGE_SIZE = 50;
const TYPING_IDLE_MS = 2500;

const NOT_ALLOWED = 'Messaging is available only between connected users.';
const BLOCKED = 'Messaging is unavailable.';

const STATUS_LABEL = { sent: 'Sent', delivered: 'Delivered', read: 'Read' };

// Mirrors the server rules so obvious mistakes are caught before uploading.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_MB = 5;

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** Accepts only well-formed message objects from the socket. */
const isMessage = (m) =>
  m &&
  Number.isInteger(m.id) &&
  Number.isInteger(m.senderId) &&
  Number.isInteger(m.receiverId) &&
  typeof m.message === 'string' &&
  (m.type !== 'image' || (m.image && typeof m.image.path === 'string' && m.image.path.startsWith('/messages/')));

const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

function mergeMessages(current, incoming) {
  const next = new Map(current);
  for (const m of incoming) next.set(m.id, { ...next.get(m.id), ...m });
  return next;
}

function PrivateChat() {
  const { userId: param } = useParams();
  const otherId = Number(param);

  const [participant, setParticipant] = useState(null);
  const [canSend, setCanSend] = useState(false);
  const [messages, setMessages] = useState(() => new Map());
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [accessError, setAccessError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // true / false, or null when the other user does not share their online status.
  const [online, setOnline] = useState(null);
  const [typing, setTyping] = useState(false);
  const [visible, setVisible] = useState(isVisible);

  const sendingRef = useRef(false);
  const typingTimer = useRef(null);
  const typingSent = useRef(false);
  const endRef = useRef(null);
  const lastReadSent = useRef(0);
  const fileInput = useRef(null);

  // Read receipts only while the user can actually see the conversation.
  useEffect(() => {
    const onChange = () => setVisible(isVisible());
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const belongsHere = useCallback(
    (m) => (m.senderId === otherId || m.receiverId === otherId) && m.senderId !== m.receiverId,
    [otherId]
  );

  /** Loads (or reloads) the newest page and merges it — used on open and reconnect. */
  const loadLatest = useCallback(async () => {
    const res = await messageService.getMessages(otherId, { limit: PAGE_SIZE });
    const data = res.data;
    setParticipant(data.participant);
    setCanSend(data.canSend);
    setMessages((current) => mergeMessages(current, data.messages));
    setCursor((existing) => existing ?? (data.pagination.hasMore ? data.pagination.nextCursor : null));
    return data;
  }, [otherId]);

  // Initial load: history first, then the real-time subscription.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAccessError(null);
    setMessages(new Map());
    setCursor(null);
    lastReadSent.current = 0;

    if (!Number.isInteger(otherId) || otherId <= 0) {
      setAccessError(NOT_ALLOWED);
      setLoading(false);
      return undefined;
    }

    loadLatest()
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 403) setAccessError(/cannot message/i.test(err.message) ? BLOCKED : NOT_ALLOWED);
        else if (err.status === 404) setAccessError('This user is not available.');
        else setAccessError(err.message || 'Unable to load messages.');
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [otherId, loadLatest]);

  const ready = !loading && !accessError;

  // Socket: join the conversation (re-joined on every reconnect) and listen.
  useEffect(() => {
    if (!ready) return undefined;

    const join = async () => {
      const ack = await socketService.request(SOCKET_EVENTS.CONVERSATION_JOIN, { userId: otherId });
      if (ack.success) {
        setOnline(typeof ack.participantOnline === 'boolean' ? ack.participantOnline : null);
        setCanSend(ack.canSend);
      }
    };
    let firstConnect = true;
    const offConnect = socketService.onConnect(() => {
      join();
      // After a reconnect, missed messages are fetched instead of assumed.
      if (!firstConnect) loadLatest().catch(() => {});
      firstConnect = false;
    });

    const offReceived = socketService.on(SOCKET_EVENTS.MESSAGE_RECEIVED, (message, ack) => {
      if (typeof ack === 'function') ack({ received: true });
      if (!isMessage(message) || !belongsHere(message)) return;
      setMessages((current) => mergeMessages(current, [message]));
      if (message.senderId === otherId) setTyping(false);
    });
    const updateStatus = (status, field) => (event) => {
      if (!event || !Array.isArray(event.messageIds)) return;
      setMessages((current) => {
        const next = new Map(current);
        for (const id of event.messageIds) {
          const m = next.get(id);
          if (m && !(status === 'delivered' && m.status === 'read')) next.set(id, { ...m, status, [field]: event[field] });
        }
        return next;
      });
    };
    const offDelivered = socketService.on(SOCKET_EVENTS.MESSAGE_DELIVERED, updateStatus('delivered', 'deliveredAt'));
    const offRead = socketService.on(SOCKET_EVENTS.MESSAGE_READ, updateStatus('read', 'readAt'));
    const offPresence = socketService.on(SOCKET_EVENTS.PRESENCE_UPDATE, (event) => {
      if (event?.userId === otherId) setOnline(Boolean(event.online));
    });
    const offTypingStart = socketService.on(SOCKET_EVENTS.TYPING_START, (e) => e?.userId === otherId && setTyping(true));
    const offTypingStop = socketService.on(SOCKET_EVENTS.TYPING_STOP, (e) => e?.userId === otherId && setTyping(false));
    const offClosed = socketService.on(SOCKET_EVENTS.CONVERSATION_CLOSED, () => setCanSend(false));

    return () => {
      [offConnect, offReceived, offDelivered, offRead, offPresence, offTypingStart, offTypingStop, offClosed].forEach((off) => off());
      socketService.request(SOCKET_EVENTS.CONVERSATION_LEAVE, { userId: otherId });
      clearTimeout(typingTimer.current);
    };
  }, [ready, otherId, belongsHere, loadLatest]);

  const ordered = useMemo(() => [...messages.values()].sort((a, b) => a.id - b.id), [messages]);

  // Read receipts: the conversation is open and visible, so incoming messages are read.
  useEffect(() => {
    if (!visible) return;
    const latestUnread = [...ordered].reverse().find((m) => m.senderId === otherId && m.status !== 'read');
    if (!latestUnread || latestUnread.id <= lastReadSent.current) return;
    lastReadSent.current = latestUnread.id;
    messageService
      .markMessageRead(latestUnread.id)
      .then((res) => {
        const ids = new Set(res.data.read.messageIds);
        setMessages((current) => {
          const next = new Map(current);
          for (const id of ids) if (next.has(id)) next.set(id, { ...next.get(id), status: 'read', readAt: res.data.read.readAt });
          return next;
        });
      })
      .catch(() => {});
  }, [ordered, otherId, visible]);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [ordered.length]);

  const stopTyping = useCallback(() => {
    clearTimeout(typingTimer.current);
    if (typingSent.current) {
      typingSent.current = false;
      socketService.emit(SOCKET_EVENTS.TYPING_STOP, { userId: otherId });
    }
  }, [otherId]);

  const onDraftChange = (event) => {
    setDraft(event.target.value);
    setSendError(null);
    if (!socketService.isConnected()) return;
    if (!typingSent.current) {
      typingSent.current = true;
      socketService.emit(SOCKET_EVENTS.TYPING_START, { userId: otherId });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const send = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sendingRef.current || !canSend) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    stopTyping();
    try {
      let message;
      if (socketService.isConnected()) {
        const ack = await socketService.request(SOCKET_EVENTS.MESSAGE_SEND, { receiverId: otherId, message: text });
        if (!ack.success) throw Object.assign(new Error(ack.error), { status: ack.code });
        message = ack.message;
      } else {
        // Offline socket: REST still saves it; the receiver gets it from history.
        message = (await messageService.sendMessage(otherId, text)).data.message;
      }
      setMessages((current) => mergeMessages(current, [message]));
      setDraft('');
    } catch (err) {
      if (err.status === 403) setCanSend(false);
      setSendError(err.status === 429 || err.status === 403 ? err.message : 'Unable to send message.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const sendImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file || sendingRef.current || !canSend) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setSendError('Unsupported image type. Use a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setSendError(`Image is too large. The maximum size is ${IMAGE_MAX_MB} MB.`);
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    stopTyping();
    try {
      // The text box, if filled, becomes the caption.
      const res = await messageService.sendImage(otherId, file, draft.trim());
      setMessages((current) => mergeMessages(current, [res.data.message]));
      setDraft('');
    } catch (err) {
      if (err.status === 403) setCanSend(false);
      setSendError([403, 413, 415, 422, 429].includes(err.status) ? err.message : 'Unable to send image.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const loadOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await messageService.getMessages(otherId, { limit: PAGE_SIZE, before: cursor });
      setMessages((current) => mergeMessages(current, res.data.messages));
      setCursor(res.data.pagination.hasMore ? res.data.pagination.nextCursor : null);
    } catch {
      setSendError('Unable to load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  };

  if (loading) {
    return (
      <section className="card chat">
        <p className="muted">Loading messages…</p>
      </section>
    );
  }

  if (accessError) {
    return (
      <section className="card chat">
        <Link to={USER_PATHS.CONNECTIONS}>&lt; Back</Link>
        <h1>Private chat</h1>
        <Alert type="error">{accessError}</Alert>
      </section>
    );
  }

  return (
    <section className="card chat">
      <header className="chat__header">
        <Link to={USER_PATHS.MESSAGES} className="btn btn--small btn--ghost chat__back" aria-label="Back to messages">
          <Icon name="arrowRight" size={18} className="icon--flip" />
          Back
        </Link>
        <Avatar src={participant?.profilePicture} name={participant?.name} size="small" />
        <div>
          <h1 className="chat__title">{participant?.name}</h1>
          <p className="muted chat__presence" data-testid="presence">
            {typing ? `${participant?.name} is typing…` : online === null ? '' : online ? 'Online' : 'Offline'}
          </p>
        </div>
        {canSend && (
          <Link className="btn btn--small chat__call" to={videoCallPath(otherId)}>
            <Icon name="video" size={18} />
            Video call
          </Link>
        )}
        {participant && (
          <SafetyActions
            user={participant}
            onBlocked={() => {
              setCanSend(false);
              setOnline(null);
            }}
          />
        )}
      </header>

      <div className="chat__messages" role="log" aria-live="polite" aria-label="Messages">
        {cursor && (
          <button type="button" className="btn btn--small chat__older" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}
        {ordered.length === 0 ? (
          <p className="muted chat__empty">No messages yet. Start the conversation.</p>
        ) : (
          ordered.map((m) => {
            const mine = m.senderId !== otherId;
            return (
              <div key={m.id} className={`chat__bubble ${mine ? 'chat__bubble--mine' : 'chat__bubble--theirs'}`} data-testid="chat-message">
                {m.type === 'image' && m.image && <ChatImage image={m.image} alt={`Photo from ${mine ? 'you' : participant?.name || 'your connection'}`} />}
                {m.message && <p className="chat__text">{m.message}</p>}
                <span className="chat__meta">
                  {formatTime(m.createdAt)}
                  {mine && ` · ${STATUS_LABEL[m.status] || 'Sent'}`}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <Alert type="error">{sendError}</Alert>
      {canSend ? (
        <form className="chat__composer" onSubmit={send}>
          <label htmlFor="chat-input" className="visually-hidden">
            Message
          </label>
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            className="visually-hidden"
            data-testid="chat-image-input"
            aria-label="Image to send"
            tabIndex={-1}
            onChange={sendImage}
          />
          <button
            type="button"
            className="btn"
            onClick={() => fileInput.current?.click()}
            disabled={sending}
            aria-label="Send an image"
            title="Send an image (JPG, PNG or WEBP)"
          >
            <Icon name="image" size={18} />
            <span className="chat__btn-label">Image</span>
          </button>
          <input
            id="chat-input"
            type="text"
            value={draft}
            onChange={onDraftChange}
            placeholder="Type a message..."
            maxLength={2000}
            autoComplete="off"
          />
          <button type="submit" className="btn btn--primary" disabled={sending || !draft.trim()}>
            <Icon name="send" size={18} />
            <span className="chat__btn-label">{sending ? 'Sending…' : 'Send'}</span>
          </button>
        </form>
      ) : (
        <p className="muted">You can no longer send messages in this conversation.</p>
      )}
    </section>
  );
}

export default PrivateChat;
