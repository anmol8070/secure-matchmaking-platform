/**
 * Video call logic (Phase 12): media, signalling and WebRTC for one call.
 * The page (pages/video/VideoCall.jsx) only renders what this hook returns.
 *
 *   start a call:   useVideoCall({ startUserId })   caller
 *   answer/rejoin:  useVideoCall({ callId })        receiver accepting, or either side after a refresh
 *
 * Rules:
 * - Camera/mic are requested BEFORE the call is placed or accepted, and no
 *   media is sent before the call is accepted and permission is granted.
 * - The call counts as connected only when RTCPeerConnection reports
 *   "connected" (signalling success alone is not a connected call).
 * - The caller makes every offer (also ICE restarts); the receiver answers.
 * - On end, failure or unmount: the peer connection is closed, every local
 *   track is stopped (camera light off) and listeners/timers are removed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { callService } from '../services/callService.js';
import { SOCKET_EVENTS, socketService } from '../services/socketService.js';
import { createPeerConnection, getLocalMedia, stopStream } from '../services/webrtcService.js';

const RECONNECT_WAIT_MS = 5000; // "disconnected" this long → ICE restart
const RECONNECT_GIVE_UP_MS = 15000; // still not back → the call failed
const TERMINAL = ['rejected', 'missed', 'cancelled', 'busy', 'ended', 'failed'];

export const CALL_PHASES = Object.freeze({
  PREPARING: 'preparing', // asking for camera/microphone
  MEDIA_ERROR: 'media_error',
  CALLING: 'calling', // outgoing, ringing at the other side
  CONNECTING: 'connecting', // accepted, WebRTC negotiating
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ENDED: 'ended',
  ERROR: 'error',
});

export default function useVideoCall({ startUserId, callId: joinCallId }) {
  const [phase, setPhase] = useState(CALL_PHASES.PREPARING);
  const [error, setError] = useState(null);
  const [endInfo, setEndInfo] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [receiverOnline, setReceiverOnline] = useState(true);
  const [relayAvailable, setRelayAvailable] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const callIdRef = useRef(null);
  const roleRef = useRef(null); // 'caller' | 'receiver'
  const localRef = useRef(null);
  const peerRef = useRef(null);
  const iceRef = useRef([]);
  const endedRef = useRef(false);
  const reportedConnectedRef = useRef(false);
  const restartTriedRef = useRef(false);
  const timersRef = useRef([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  const later = (fn, ms) => timersRef.current.push(setTimeout(fn, ms));

  /** Releases everything: peer connection, camera/mic, timers. */
  const releaseMedia = useCallback(() => {
    clearTimers();
    peerRef.current?.close();
    peerRef.current = null;
    stopStream(localRef.current);
    localRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  /** Ends the call locally exactly once (the server state was already changed). */
  const finish = useCallback(
    (info) => {
      if (endedRef.current) return;
      endedRef.current = true;
      releaseMedia();
      setEndInfo(info);
      setPhase(info.status === 'failed' || info.error ? CALL_PHASES.ERROR : CALL_PHASES.ENDED);
      if (info.error) setError(info.error);
    },
    [releaseMedia]
  );

  const reportFailure = useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || endedRef.current) return;
    await socketService.request(SOCKET_EVENTS.CALL_FAILED, { callId, reason: 'connection_failed' });
    finish({ status: 'failed', reason: 'connection_failed', error: 'The connection was lost and could not be restored.' });
  }, [finish]);

  const sendOffer = useCallback(
    async ({ iceRestart = false } = {}) => {
      const peer = peerRef.current;
      if (!peer) return;
      const description = await peer.createOffer({ iceRestart });
      const ack = await socketService.request(SOCKET_EVENTS.CALL_OFFER, { callId: callIdRef.current, description });
      if (!ack.success && ack.code === 409) finish({ status: 'ended', reason: 'ended' });
    },
    [finish]
  );

  const onConnectionState = useCallback(
    (state) => {
      if (endedRef.current) return;
      if (state === 'connected') {
        clearTimers();
        restartTriedRef.current = false;
        setPhase(CALL_PHASES.CONNECTED);
        if (!reportedConnectedRef.current) {
          reportedConnectedRef.current = true;
          socketService.request(SOCKET_EVENTS.CALL_CONNECTED, { callId: callIdRef.current });
        }
      } else if (state === 'disconnected' || state === 'failed') {
        setPhase(CALL_PHASES.RECONNECTING);
        const tryRestart = () => {
          if (endedRef.current || peerRef.current?.pc.connectionState === 'connected') return;
          if (roleRef.current === 'caller' && !restartTriedRef.current) {
            restartTriedRef.current = true;
            sendOffer({ iceRestart: true }).catch(() => {});
          }
        };
        if (state === 'failed') tryRestart();
        else later(tryRestart, RECONNECT_WAIT_MS);
        later(() => {
          if (!endedRef.current && peerRef.current?.pc.connectionState !== 'connected') reportFailure();
        }, RECONNECT_GIVE_UP_MS);
      }
    },
    [reportFailure, sendOffer]
  );

  /** (Re)creates the peer connection with the local tracks. */
  const buildPeer = useCallback(() => {
    peerRef.current?.close();
    setRemoteStream(null);
    reportedConnectedRef.current = false;
    peerRef.current = createPeerConnection({
      iceServers: iceRef.current,
      localStream: localRef.current,
      onRemoteStream: (stream) => setRemoteStream(stream),
      onIceCandidate: (candidate) => socketService.request(SOCKET_EVENTS.CALL_ICE, { callId: callIdRef.current, candidate }),
      onConnectionState,
    });
    return peerRef.current;
  }, [onConnectionState]);

  /* ---------- start / answer / rejoin ---------- */
  useEffect(() => {
    let cancelled = false;
    endedRef.current = false;
    setError(null);
    setEndInfo(null);
    setPhase(CALL_PHASES.PREPARING);

    const fail = (message) => !cancelled && finish({ status: 'failed', error: message || 'Unable to start the call.' });

    (async () => {
      let stream;
      try {
        stream = await getLocalMedia();
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setPhase(CALL_PHASES.MEDIA_ERROR);
        return;
      }
      if (cancelled) {
        stopStream(stream);
        return;
      }
      localRef.current = stream;
      setLocalStream(stream);
      setMuted(false);
      setCameraOff(false);

      try {
        const ice = await callService.getIceServers();
        iceRef.current = ice.data.iceServers || [];
        if (!cancelled) setRelayAvailable(ice.data.relay === true);
      } catch {
        iceRef.current = [];
      }
      if (cancelled) return;

      if (startUserId) {
        roleRef.current = 'caller';
        const ack = await socketService.request(SOCKET_EVENTS.CALL_INITIATE, { userId: startUserId });
        if (cancelled) {
          if (ack.success && !ack.busy) socketService.emit(SOCKET_EVENTS.CALL_END, { callId: ack.call.id, reason: 'navigated_away' });
          return;
        }
        if (!ack.success) return fail(ack.error);
        callIdRef.current = ack.call.id;
        setOtherUser(ack.call.otherUser);
        if (ack.busy) return finish({ status: 'busy', reason: 'busy' });
        setReceiverOnline(ack.receiverOnline !== false);
        setPhase(CALL_PHASES.CALLING);
        return;
      }

      // Answering or re-joining an existing call.
      let call;
      try {
        call = (await callService.getCall(joinCallId)).data.call;
      } catch (err) {
        return fail(err.status === 404 ? 'This call does not exist.' : err.message);
      }
      if (cancelled) return;
      callIdRef.current = call.id;
      roleRef.current = call.direction === 'outgoing' ? 'caller' : 'receiver';
      setOtherUser(call.otherUser);
      if (TERMINAL.includes(call.status)) return finish({ status: call.status, reason: call.endReason });

      if (call.status === 'ringing' && roleRef.current === 'receiver') {
        const ack = await socketService.request(SOCKET_EVENTS.CALL_ACCEPT, { callId: call.id });
        if (cancelled) return;
        if (!ack.success) return fail(ack.error);
        buildPeer(); // waits for the caller's offer
        setPhase(CALL_PHASES.CONNECTING);
        return;
      }
      const ack = await socketService.request(SOCKET_EVENTS.CALL_JOIN, { callId: call.id });
      if (cancelled) return;
      if (!ack.success) return fail(ack.error);
      if (call.status === 'ringing') {
        setPhase(CALL_PHASES.CALLING);
        return;
      }
      buildPeer();
      setPhase(CALL_PHASES.CONNECTING);
      if (roleRef.current === 'caller') await sendOffer();
    })().catch(() => fail());

    return () => {
      cancelled = true;
    };
  }, [startUserId, joinCallId, attempt, buildPeer, finish, sendOffer]);

  /* ---------- signalling events ---------- */
  useEffect(() => {
    const mine = (event) => event && callIdRef.current && Number(event.callId ?? event.call?.id) === callIdRef.current;
    const offs = [
      socketService.on(SOCKET_EVENTS.CALL_ACCEPTED, (event) => {
        if (!mine(event) || roleRef.current !== 'caller' || phaseRef.current !== CALL_PHASES.CALLING) return;
        buildPeer();
        setPhase(CALL_PHASES.CONNECTING);
        sendOffer().catch(() => reportFailure());
      }),
      socketService.on(SOCKET_EVENTS.CALL_OFFER, async (event) => {
        if (!mine(event) || roleRef.current !== 'receiver' || endedRef.current) return;
        const state = peerRef.current?.pc.connectionState;
        if (!peerRef.current || state === 'failed' || state === 'closed') buildPeer();
        try {
          const description = await peerRef.current.answer(event.description);
          await socketService.request(SOCKET_EVENTS.CALL_ANSWER, { callId: callIdRef.current, description });
        } catch {
          reportFailure();
        }
      }),
      socketService.on(SOCKET_EVENTS.CALL_ANSWER, (event) => {
        if (!mine(event) || roleRef.current !== 'caller') return;
        peerRef.current?.acceptAnswer(event.description).catch(() => reportFailure());
      }),
      socketService.on(SOCKET_EVENTS.CALL_ICE, (event) => {
        if (mine(event)) peerRef.current?.addRemoteCandidate(event.candidate);
      }),
      socketService.on(SOCKET_EVENTS.CALL_ENDED, (event) => {
        if (mine(event)) finish({ status: event.call.status, reason: event.call.endReason, durationSeconds: event.call.durationSeconds });
      }),
      socketService.on(SOCKET_EVENTS.CALL_PEER_LEFT, (event) => {
        if (mine(event) && !endedRef.current && phaseRef.current !== CALL_PHASES.CALLING) setPhase(CALL_PHASES.RECONNECTING);
      }),
      // The other side reloaded: its old peer connection is gone, start over.
      socketService.on(SOCKET_EVENTS.CALL_PEER_REJOINED, (event) => {
        if (!mine(event) || endedRef.current || phaseRef.current === CALL_PHASES.CALLING) return;
        buildPeer();
        setPhase(CALL_PHASES.CONNECTING);
        if (roleRef.current === 'caller') sendOffer().catch(() => reportFailure());
      }),
    ];
    // Our own socket reconnected (network blip): re-bind this device to the call.
    let first = true;
    offs.push(
      socketService.onConnect(() => {
        if (first) {
          first = false;
          return;
        }
        if (callIdRef.current && !endedRef.current) socketService.request(SOCKET_EVENTS.CALL_JOIN, { callId: callIdRef.current });
      })
    );
    return () => offs.forEach((off) => off());
  }, [buildPeer, finish, reportFailure, sendOffer]);

  /* ---------- leaving the page ends the call and frees the devices ---------- */
  useEffect(
    () => () => {
      if (callIdRef.current && !endedRef.current) {
        socketService.emit(SOCKET_EVENTS.CALL_END, { callId: callIdRef.current, reason: 'navigated_away' });
      }
      endedRef.current = true;
      releaseMedia();
    },
    [releaseMedia]
  );

  /* ---------- controls ---------- */
  const toggleMute = useCallback(() => {
    const tracks = localRef.current?.getAudioTracks() || [];
    if (!tracks.length) return;
    const nextMuted = tracks[0].enabled; // enabled → mute
    tracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, []);

  const toggleCamera = useCallback(() => {
    const tracks = (localRef.current?.getVideoTracks() || []).filter((t) => t.readyState !== 'ended');
    if (!tracks.length) return;
    const nextOff = tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = !nextOff;
    });
    setCameraOff(nextOff);
  }, []);

  const hangUp = useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || endedRef.current) {
      finish({ status: 'ended', reason: 'hangup' });
      return;
    }
    const ack = await socketService.request(SOCKET_EVENTS.CALL_END, { callId, reason: 'hangup' });
    finish({ status: ack.call?.status || 'ended', reason: 'hangup', durationSeconds: ack.call?.durationSeconds });
  }, [finish]);

  /** Tries camera/microphone again after a permission/device error. */
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    phase,
    error,
    endInfo,
    otherUser,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    receiverOnline,
    relayAvailable,
    toggleMute,
    toggleCamera,
    hangUp,
    retry,
  };
}
