/**
 * Incoming video call dialog (Phase 12). Mounted once in UserLayout for
 * signed-in users, so a call rings on whatever page the user is on — while
 * the app is open. (Ringing when the app is closed would need push
 * notifications, which are not implemented.)
 *
 * One dialog per call id; it closes when the call is answered on another
 * device, cancelled, or missed. Accepting opens the call page, which asks
 * for camera/microphone first and only then accepts the call.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../profile/Avatar.jsx';
import useAuth from '../../hooks/useAuth.js';
import { SOCKET_EVENTS, socketService } from '../../services/socketService.js';
import { USER_PATHS } from '../../routes/paths.js';

function IncomingCall() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const sameCall = (event) => (current) => (current && Number(event?.call?.id) === current.call.id ? null : current);
    const offs = [
      socketService.on(SOCKET_EVENTS.CALL_INCOMING, (event) => {
        if (!event?.call?.id || !event.caller) return;
        setIncoming((current) => (current?.call.id === event.call.id ? current : event));
      }),
      // Answered elsewhere, cancelled, missed or rejected → stop ringing.
      socketService.on(SOCKET_EVENTS.CALL_ACCEPTED, (event) => setIncoming(sameCall(event))),
      socketService.on(SOCKET_EVENTS.CALL_ENDED, (event) => setIncoming(sameCall(event))),
    ];
    return () => offs.forEach((off) => off());
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) setIncoming(null);
  }, [isAuthenticated]);

  if (!incoming) return null;
  const { call, caller } = incoming;

  const accept = () => {
    setIncoming(null);
    navigate(`${USER_PATHS.VIDEO}?call=${call.id}`);
  };
  const reject = async () => {
    setBusy(true);
    await socketService.request(SOCKET_EVENTS.CALL_REJECT, { callId: call.id });
    setBusy(false);
    setIncoming(null);
  };

  return (
    <div className="incoming-call" role="alertdialog" aria-modal="false" aria-labelledby="incoming-call-title">
      <Avatar src={caller.profilePicture} name={caller.name} size="small" />
      <div className="incoming-call__body">
        <p id="incoming-call-title" className="incoming-call__name">
          {caller.name}
        </p>
        <p className="muted">Incoming video call…</p>
      </div>
      <div className="incoming-call__actions">
        <button type="button" className="btn btn--primary" onClick={accept} disabled={busy}>
          Accept
        </button>
        <button type="button" className="btn btn--danger" onClick={reject} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  );
}

export default IncomingCall;
