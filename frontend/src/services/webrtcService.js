/**
 * Thin WebRTC helpers for private video calls (Phase 12).
 *
 * - getLocalMedia(): camera + microphone with every failure mapped to a
 *   clear message (permission denied, no camera/mic, device busy, insecure
 *   page, unsupported browser).
 * - createPeerConnection(): an RTCPeerConnection wired to callbacks, with ICE
 *   candidates that arrive before the remote description queued until it
 *   is set (they would otherwise be rejected).
 * - stopStream(): stops every track so the camera/mic light goes off.
 *
 * No face detection or recognition of any kind happens here; media goes
 * peer-to-peer and is never recorded.
 */

export const MEDIA_ERRORS = Object.freeze({
  insecure: 'Video calls need a secure (HTTPS) connection.',
  unsupported: 'Your browser does not support video calls. Please use a recent version of Chrome, Edge, Firefox or Safari.',
  permission_denied: 'Camera and microphone permission is required for video calls. Allow access in your browser settings and try again.',
  no_camera: 'No camera was found. Connect a camera and try again.',
  no_microphone: 'No microphone was found. Connect a microphone and try again.',
  no_devices: 'No camera or microphone was found. Connect them and try again.',
  in_use: 'Your camera or microphone is being used by another application. Close it and try again.',
  failed: 'Could not start your camera and microphone. Please try again.',
});

/** Maps a getUserMedia error to a MEDIA_ERRORS key. */
export function classifyMediaError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission_denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no_devices';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in_use';
    default:
      return 'failed';
  }
}

export class MediaAccessError extends Error {
  constructor(code) {
    super(MEDIA_ERRORS[code] || MEDIA_ERRORS.failed);
    this.name = 'MediaAccessError';
    this.code = code;
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Requests camera and microphone. Rejects with MediaAccessError; when one
 * device is missing the message says which one.
 */
export async function getLocalMedia() {
  if (typeof window !== 'undefined' && window.isSecureContext === false) throw new MediaAccessError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new MediaAccessError('unsupported');

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const code = classifyMediaError(error);
    if (code === 'no_devices' && navigator.mediaDevices.enumerateDevices) {
      // Say which device is missing when the browser lets us look.
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const hasCamera = devices.some((d) => d.kind === 'videoinput');
      const hasMic = devices.some((d) => d.kind === 'audioinput');
      if (hasCamera && !hasMic) throw new MediaAccessError('no_microphone');
      if (!hasCamera && hasMic) throw new MediaAccessError('no_camera');
    }
    throw new MediaAccessError(code);
  }
}

/**
 * @param {object} options
 * @param {RTCIceServer[]} options.iceServers
 * @param {MediaStream} options.localStream          tracks to send
 * @param {(stream: MediaStream) => void} options.onRemoteStream
 * @param {(candidate: object) => void} options.onIceCandidate   send to the peer
 * @param {(state: string) => void} options.onConnectionState
 */
export function createPeerConnection({ iceServers, localStream, onRemoteStream, onIceCandidate, onConnectionState }) {
  const pc = new RTCPeerConnection({ iceServers });
  const pendingCandidates = [];
  let remoteStream = null;

  localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
  };
  pc.ontrack = (event) => {
    remoteStream = event.streams?.[0] || remoteStream || new MediaStream();
    if (!event.streams?.[0]) remoteStream.addTrack(event.track);
    onRemoteStream(remoteStream);
  };
  pc.onconnectionstatechange = () => onConnectionState(pc.connectionState);

  const flush = async () => {
    while (pendingCandidates.length) await pc.addIceCandidate(pendingCandidates.shift()).catch(() => {});
  };

  return {
    pc,
    async createOffer({ iceRestart = false } = {}) {
      const offer = await pc.createOffer({ iceRestart });
      await pc.setLocalDescription(offer);
      return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
    },
    /** Applies a remote offer and returns the answer to send back. */
    async answer(offer) {
      await pc.setRemoteDescription(offer);
      await flush();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
    },
    async acceptAnswer(answer) {
      await pc.setRemoteDescription(answer);
      await flush();
    },
    async addRemoteCandidate(candidate) {
      if (!pc.remoteDescription) pendingCandidates.push(candidate);
      else await pc.addIceCandidate(candidate).catch(() => {});
    },
    close() {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pendingCandidates.length = 0;
      pc.close();
    },
  };
}
