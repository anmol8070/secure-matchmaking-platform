/**
 * Private video call (Phase 12) — /video?with=<userId> to call,
 * /video?call=<callId> to answer (from the incoming-call dialog) or to
 * re-join after a refresh. All call logic is in hooks/useVideoCall.js;
 * this page only shows it. Nothing is recorded.
 */
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Avatar from '../../components/profile/Avatar.jsx';
import Icon from '../../components/common/Icon.jsx';
import useVideoCall, { CALL_PHASES } from '../../hooks/useVideoCall.js';
import { USER_PATHS, chatPath } from '../../routes/paths.js';

const END_MESSAGES = {
  rejected: 'The call was declined.',
  missed: 'No answer.',
  cancelled: 'The call was cancelled.',
  busy: 'The user is on another call. Try again later.',
  ended: 'Call ended.',
  failed: 'The call could not be connected.',
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
};

function useStream(ref, stream) {
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [ref, stream]);
}

function statusText(phase, name, receiverOnline) {
  switch (phase) {
    case CALL_PHASES.PREPARING:
      return 'Starting your camera and microphone…';
    case CALL_PHASES.CALLING:
      return receiverOnline ? `Calling ${name}…` : `Calling ${name}… (they appear to be offline)`;
    case CALL_PHASES.CONNECTING:
      return 'Connecting…';
    case CALL_PHASES.CONNECTED:
      return 'Connected';
    case CALL_PHASES.RECONNECTING:
      return 'Connection interrupted. Reconnecting…';
    default:
      return '';
  }
}

function VideoCall() {
  const [params] = useSearchParams();
  const startUserId = Number(params.get('with')) || null;
  const callId = Number(params.get('call')) || null;
  const call = useVideoCall({ startUserId, callId });
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  useStream(localVideo, call.localStream);
  useStream(remoteVideo, call.remoteStream);

  const name = call.otherUser?.name || 'your connection';
  const live = ![CALL_PHASES.ENDED, CALL_PHASES.ERROR, CALL_PHASES.MEDIA_ERROR].includes(call.phase);

  if (!startUserId && !callId) {
    return (
      <section className="card">
        <h1>Video call</h1>
        <Alert type="error">No call selected.</Alert>
        <Link to={USER_PATHS.CONNECTIONS}>Back to connections</Link>
      </section>
    );
  }

  if (call.phase === CALL_PHASES.MEDIA_ERROR) {
    return (
      <section className="card video-call">
        <h1>Video call</h1>
        <Alert type="error">{call.error}</Alert>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={call.retry}>
            Try again
          </button>
          <Link className="btn" to={USER_PATHS.CONNECTIONS}>
            Cancel
          </Link>
        </div>
      </section>
    );
  }

  if (!live) {
    const duration = formatDuration(call.endInfo?.durationSeconds);
    return (
      <section className="card video-call">
        <h1>Video call</h1>
        {call.phase === CALL_PHASES.ERROR ? (
          <Alert type="error">{call.error || END_MESSAGES.failed}</Alert>
        ) : (
          <p role="status">
            {END_MESSAGES[call.endInfo?.status] || END_MESSAGES.ended}
            {duration && ` Duration ${duration}.`}
          </p>
        )}
        <div className="actions">
          {call.otherUser && (
            <Link className="btn btn--primary" to={chatPath(call.otherUser.userId)}>
              Open chat
            </Link>
          )}
          <Link className="btn" to={USER_PATHS.CALLS}>
            Call history
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`video-call video-call--live${call.phase === CALL_PHASES.CONNECTED ? ' video-call--connected' : ''}`}
      aria-label={`Video call with ${name}`}
    >
      <header className="video-call__header">
        <Avatar src={call.otherUser?.profilePicture} name={call.otherUser?.name} size="small" />
        <div>
          <h1 className="video-call__title">{name}</h1>
          <p className="video-call__status" role="status" data-testid="call-status">
            {statusText(call.phase, name, call.receiverOnline)}
          </p>
          {call.relayAvailable === false && (
            <p className="muted">No TURN relay is configured. This call can fail when a direct connection is blocked.</p>
          )}
        </div>
      </header>

      <div className="video-call__stage">
        <video
          ref={remoteVideo}
          className="video-call__remote"
          autoPlay
          playsInline
          data-testid="remote-video"
          aria-label={`Video from ${name}`}
          hidden={!call.remoteStream}
        />
        {!call.remoteStream && (
          <div className="video-call__placeholder">
            <Avatar src={call.otherUser?.profilePicture} name={call.otherUser?.name} size="large" />
            <span>Waiting for {name}’s video…</span>
          </div>
        )}
        <video
          ref={localVideo}
          className="video-call__local"
          autoPlay
          playsInline
          muted // never play your own microphone back
          data-testid="local-video"
          aria-label="Your camera"
        />
      </div>

      <div className="video-call__controls">
        <button type="button" className="btn call-control" onClick={call.toggleMute} aria-pressed={call.muted} disabled={!call.localStream}>
          <Icon name={call.muted ? 'micOff' : 'mic'} size={22} />
          {call.muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="btn call-control" onClick={call.toggleCamera} aria-pressed={call.cameraOff} disabled={!call.localStream}>
          <Icon name={call.cameraOff ? 'cameraOff' : 'camera'} size={22} />
          {call.cameraOff ? 'Camera on' : 'Camera off'}
        </button>
        <button type="button" className="btn call-control call-control--end" onClick={call.hangUp}>
          <Icon name="phone" size={22} />
          {call.phase === CALL_PHASES.CALLING ? 'Cancel' : 'End call'}
        </button>
      </div>
    </section>
  );
}

export default VideoCall;
