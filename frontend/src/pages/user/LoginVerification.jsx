/**
 * Login step 2 — live human/face PRESENCE verification.
 *
 *   camera permission → live preview → capture → face detection (in browser)
 *     0 faces  → "No face detected. Please take the photo again."
 *     2+ faces → "Multiple faces detected. …"
 *     1 face   → send the RESULT (not the image) → final login → dashboard
 *
 * This only checks that a real person is present. It never identifies the
 * person, never compares with the profile picture, and the captured frame is
 * never uploaded, stored or used as a profile picture — it is cleared right
 * after detection.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import useAuth from '../../hooks/useAuth.js';
import useCamera from '../../hooks/useCamera.js';
import { detectFaces, preloadFaceDetector } from '../../services/faceDetectionService.js';
import { ADMIN_PATHS, USER_PATHS } from '../../routes/paths.js';

export const VERIFICATION_MESSAGES = Object.freeze({
  noFace: 'No face detected. Please take the photo again.',
  multipleFaces: 'Multiple faces detected. Please ensure only one person is visible.',
  detectorFailed: 'Face detection could not be loaded. Check your internet connection and try again.',
  sessionExpired: 'Your verification session has expired. Please log in again.',
});

function LoginVerification() {
  const navigate = useNavigate();
  const { verification, startLiveVerification, completeLiveVerification, abandonVerification } = useAuth();
  const camera = useCamera();
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState('camera'); // camera | analysing | submitting
  const [message, setMessage] = useState('');

  // Open the camera as soon as the page loads, and fetch the model in parallel.
  useEffect(() => {
    startLiveVerification();
    camera.start();
    preloadFaceDetector().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearCapture = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const captureAndVerify = async () => {
    const video = camera.videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setMessage('');
    setPhase('analysing');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    let detection;
    try {
      detection = await detectFaces(canvas);
    } catch {
      setMessage(VERIFICATION_MESSAGES.detectorFailed);
      setPhase('camera');
      return;
    } finally {
      clearCapture(); // the frame is discarded immediately
    }

    if (detection.faceCount === 0) {
      setMessage(VERIFICATION_MESSAGES.noFace);
      setPhase('camera');
      return;
    }
    if (detection.faceCount > 1) {
      setMessage(VERIFICATION_MESSAGES.multipleFaces);
      setPhase('camera');
      return;
    }

    setPhase('submitting');
    try {
      const user = await completeLiveVerification(detection);
      camera.stop();
      // VerificationRoute also redirects on AUTHENTICATED; both pick the same target.
      navigate(user.role === 'admin' ? ADMIN_PATHS.DASHBOARD : USER_PATHS.DASHBOARD, { replace: true });
    } catch (err) {
      if (err.status === 422) {
        // Server-side rule disagreed (e.g. no/multiple faces) — retake.
        setMessage(err.message);
        setPhase('camera');
        return;
      }
      // Expired/used session, too many attempts or account problem: start over.
      // VerificationRoute then redirects to the right login page, which shows the notice.
      camera.stop();
      abandonVerification(err.status === 401 ? VERIFICATION_MESSAGES.sessionExpired : err.message);
    }
  };

  const busy = phase === 'analysing' || phase === 'submitting';

  return (
    <section className="card card--narrow">
      <h1>Live verification</h1>
      <p className="muted">
        Look at the camera and take a photo. We only check that one real person is present — your face is not
        recognised, compared or stored, and this photo is not your profile picture.
      </p>

      <Alert type="error">{camera.errorMessage}</Alert>
      <Alert type="error">{message}</Alert>

      <div className="camera">
        <video
          ref={camera.videoRef}
          className="camera__video"
          autoPlay
          playsInline
          muted
          aria-label="Live camera preview"
          hidden={camera.status !== 'streaming'}
        />
        {camera.status === 'requesting' && (
          <p className="muted" role="status">
            Waiting for camera permission…
          </p>
        )}
        <canvas ref={canvasRef} hidden />
      </div>

      {camera.status === 'error' ? (
        <button type="button" className="btn btn--primary btn--block" onClick={camera.start}>
          Try again
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={captureAndVerify}
          disabled={camera.status !== 'streaming' || busy}
        >
          {phase === 'analysing' ? 'Checking…' : phase === 'submitting' ? 'Verifying…' : 'Take photo'}
        </button>
      )}

      <p className="muted form-footer">
        <button type="button" className="btn btn--link" onClick={() => { camera.stop(); abandonVerification(); }}>
          Cancel and return to login
        </button>
      </p>
    </section>
  );
}

export default LoginVerification;
