/**
 * Live camera access via navigator.mediaDevices.getUserMedia().
 * Maps every failure to a clear, user-facing message, and always stops the
 * camera when the component unmounts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const CAMERA_ERRORS = Object.freeze({
  insecure: 'Camera access requires a secure (HTTPS) connection.',
  unsupported:
    'Your browser does not support camera access. Please use a recent version of Chrome, Edge, Firefox or Safari.',
  permission_denied:
    'Camera permission is required to complete login verification. Allow camera access in your browser settings and try again.',
  no_camera: 'No camera was found. Connect a camera to complete login verification.',
  unavailable:
    'The camera is being used by another application or could not be started. Close other apps using the camera and try again.',
  stream_failed: 'Could not start the camera. Please try again.',
});

function classify(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission_denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no_camera';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'unavailable';
    default:
      return 'stream_failed';
  }
}

export default function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // Incremented by every start()/stop(); a stream that arrives for an older
  // request (double-start in StrictMode, unmount while waiting for permission)
  // is stopped immediately so the camera is never left running.
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState('idle'); // idle | requesting | streaming | error
  const [errorCode, setErrorCode] = useState(null);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const fail = useCallback((code) => {
    setErrorCode(code);
    setStatus('error');
  }, []);

  const start = useCallback(async () => {
    setErrorCode(null);
    if (typeof window !== 'undefined' && window.isSecureContext === false) return fail('insecure');
    if (!navigator.mediaDevices?.getUserMedia) return fail('unsupported');

    setStatus('requesting');
    stop();
    const requestId = requestIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return undefined;
      }
      streamRef.current = stream;
      // A track ending unexpectedly (camera unplugged) is a stream failure.
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => streamRef.current === stream && fail('stream_failed'));
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play?.();
      }
      setStatus('streaming');
    } catch (error) {
      if (requestId !== requestIdRef.current) return undefined;
      stop();
      fail(classify(error));
    }
    return undefined;
  }, [fail, stop]);

  useEffect(() => stop, [stop]);

  return {
    videoRef,
    status,
    errorCode,
    errorMessage: errorCode ? CAMERA_ERRORS[errorCode] : null,
    start,
    stop,
  };
}
