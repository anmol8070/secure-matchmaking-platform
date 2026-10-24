/**
 * Login step 2 — live human/face PRESENCE verification.
 *
 *   camera permission → live preview with a face marker → automatic capture
 *     0 faces  → "Move your face into the marker."
 *     2+ faces → "Multiple faces detected. …"
 *     1 live face inside the marker → send the RESULT (not the image) → dashboard
 *
 * The captured frame is not sent as proof of identity. If the account has no
 * profile picture yet, the frame can be saved as that picture after sign-in.
 * A profile picture is not compared with the live frame: the server never
 * receives the image, so a browser-side comparison would not be a security check.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import useAuth from '../../hooks/useAuth.js';
import useCamera from '../../hooks/useCamera.js';
import { detectFaces, preloadFaceDetector } from '../../services/faceDetectionService.js';
import { profileService } from '../../services/profileService.js';
import { rememberVerificationPhoto } from '../../services/pendingProfilePhoto.js';
import { landingPath } from '../../routes/returnPath.js';

export const VERIFICATION_MESSAGES = Object.freeze({
  noFace: 'No face detected. Move your face into the marker.',
  centerFace: 'Move your face into the center of the marker.',
  moveCloser: 'Move closer until your face fills the marker.',
  holdStill: 'Face is in the marker. Hold still while the photo is taken.',
  onePerson: 'Only one person can be in the marker.',
  multipleFaces: 'Multiple faces detected. Please ensure only one person is visible.',
  stillPhoto: 'A still photo cannot be used. Look at the camera and move your head slightly.',
  detectorFailed: 'Face detection could not be loaded. Check your internet connection and try again.',
  sessionExpired: 'Your verification session has expired. Please log in again.',
  verifying: 'Verifying…',
});

const SCAN_INTERVAL_MS = 280;
/** Consecutive in-marker samples with no movement before the still-photo notice. */
const STILL_SAMPLES = 4;
/** Share of the face size the box must move. Detector jitter on a still photo stays under this. */
const MIN_LIVE_MOVEMENT = 0.08;
/** Matches the on-screen oval: 62% of the frame, at most 300px wide, centered at 46% height. */
const MARKER_WIDTH_RATIO = 0.62;
const MARKER_MAX_WIDTH = 300;
const MARKER_ASPECT = 3.9 / 3;
const MARKER_CENTER_Y = 0.46;
/** Face box must cover at least this much of the oval, and every corner must sit inside it. */
const MIN_MARKER_FILL = 0.34;

/** How far the face box moved, relative to its size. Null when a box is missing. */
function faceMovement(first, second) {
  if (!first?.box || !second?.box) return null;
  const scale = Math.max(first.box.w, first.box.h, 1);
  const { box: a } = first;
  const { box: b } = second;
  return Math.hypot(a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h) / scale;
}

/** Oval in the same coordinate space as a camera frame (used when the page has no layout yet). */
export function markerEllipse(width, height) {
  const markerW = Math.min(width * MARKER_WIDTH_RATIO, MARKER_MAX_WIDTH);
  const markerH = markerW * MARKER_ASPECT;
  return { cx: width / 2, cy: height * MARKER_CENTER_Y, rx: markerW / 2, ry: markerH / 2 };
}

function centerInside(box, ellipse) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const nx = (cx - ellipse.cx) / ellipse.rx;
  const ny = (cy - ellipse.cy) / ellipse.ry;
  return nx * nx + ny * ny <= 1;
}

/**
 * fit — the face center is inside the oval and the face is large enough.
 * A box that fills the oval has corners outside the curve, so corners are not required.
 * small — the face is too far away.
 * outside — the face center is outside the oval, or the face is much larger than it.
 */
export function faceMarkerFit(box, ellipse) {
  if (!box || !ellipse?.rx || !ellipse?.ry) return 'outside';
  const widthShare = box.w / (ellipse.rx * 2);
  const heightShare = box.h / (ellipse.ry * 2);
  if (widthShare < MIN_MARKER_FILL || heightShare < MIN_MARKER_FILL) return 'small';
  if (!centerInside(box, ellipse)) return 'outside';
  if (widthShare > 1.7 || heightShare > 1.85) return 'outside';
  return 'fit';
}

/**
 * Next guide state from one sample. A pass requires the whole face inside the
 * marker and real movement since the previous sample. Anything else does not capture.
 */
export function nextGuideStep(previous, sample, ellipse, stillCount) {
  if (!sample || sample.faceCount === 0) {
    return { guide: 'empty', hint: VERIFICATION_MESSAGES.noFace, message: '', previous: null, stillCount: 0 };
  }
  if (sample.faceCount > 1) {
    return {
      guide: 'bad',
      hint: VERIFICATION_MESSAGES.onePerson,
      message: VERIFICATION_MESSAGES.multipleFaces,
      previous: null,
      stillCount: 0,
    };
  }
  const fit = faceMarkerFit(sample.box, ellipse);
  if (fit !== 'fit') {
    return {
      guide: 'align',
      hint: fit === 'small' ? VERIFICATION_MESSAGES.moveCloser : VERIFICATION_MESSAGES.centerFace,
      message: '',
      previous: null,
      stillCount: 0,
    };
  }
  if (!previous) {
    return { guide: 'live', hint: VERIFICATION_MESSAGES.holdStill, message: '', previous: sample, stillCount: 0 };
  }
  const movement = faceMovement(previous, sample);
  if (movement !== null && movement >= MIN_LIVE_MOVEMENT) return { type: 'pass' };
  // A real person holding still in the marker is captured after a short pause.
  const nextStill = stillCount + 1;
  if (nextStill >= STILL_SAMPLES) return { type: 'pass' };
  return {
    guide: 'live',
    hint: VERIFICATION_MESSAGES.holdStill,
    message: '',
    previous,
    stillCount: nextStill,
  };
}

function LoginVerification() {
  const navigate = useNavigate();
  const { verification, startLiveVerification, completeLiveVerification, abandonVerification } = useAuth();
  const camera = useCamera();
  const canvasRef = useRef(null);
  const phaseRef = useRef('camera'); // camera | submitting
  const previousRef = useRef(null);
  const stillCountRef = useRef(0);
  const scanLock = useRef(false);
  const sessionRef = useRef({});
  const [guide, setGuide] = useState('empty');
  const [hint, setHint] = useState(VERIFICATION_MESSAGES.noFace);
  const [message, setMessage] = useState('');

  sessionRef.current = {
    completeLiveVerification,
    abandonVerification,
    navigate,
    returnTo: verification?.returnTo,
    stop: camera.stop,
    hasProfilePhoto: Boolean(verification?.hasProfilePhoto),
  };

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

  const markerSpace = () => {
    const video = camera.videoRef.current;
    const width = video?.videoWidth || 640;
    const height = video?.videoHeight || 480;
    const marker = video?.parentElement?.querySelector('.camera__marker');
    const markerRect = marker?.getBoundingClientRect();
    const videoRect = video?.getBoundingClientRect();
    if (!video || !markerRect || markerRect.width < 2 || !videoRect || videoRect.width < 2) {
      return { measured: false, ellipse: markerEllipse(width, height), toMarker: (box) => box };
    }
    const scale = Math.max(videoRect.width / width, videoRect.height / height);
    const offsetX = (videoRect.width - width * scale) / 2;
    const offsetY = (videoRect.height - height * scale) / 2;
    return {
      measured: true,
      ellipse: {
        cx: markerRect.left - videoRect.left + markerRect.width / 2,
        cy: markerRect.top - videoRect.top + markerRect.height / 2,
        rx: markerRect.width / 2,
        ry: markerRect.height / 2,
      },
      // object-fit: cover plus the mirrored preview. The oval is drawn on that preview.
      toMarker: (box) => {
        const x = offsetX + box.x * scale;
        const y = offsetY + box.y * scale;
        const w = box.w * scale;
        const h = box.h * scale;
        return { x: videoRect.width - (x + w), y, w, h };
      },
    };
  };

  const readFrame = async () => {
    const video = camera.videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
    const detection = await detectFaces(canvas);
    if (!detection || typeof detection.faceCount !== 'number') {
      clearCapture();
      return null;
    }
    return { detection, width, height };
  };

  const showStep = (step) => {
    previousRef.current = step.previous;
    stillCountRef.current = step.stillCount;
    setGuide(step.guide);
    setHint(step.hint);
    setMessage(step.message);
  };

  const frameFile = (canvas) => {
    if (!canvas?.toBlob) return Promise.resolve(null);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], 'verification-photo.jpg', { type: 'image/jpeg' }) : null);
      }, 'image/jpeg', 0.92);
    });
  };

  const finish = async (detection, portrait) => {
    if (phaseRef.current !== 'camera') return;
    phaseRef.current = 'submitting';
    setGuide('ok');
    setHint(VERIFICATION_MESSAGES.verifying);
    setMessage('');
    const session = sessionRef.current;
    try {
      const user = await session.completeLiveVerification(detection);
      if (portrait && !session.hasProfilePhoto) {
        try {
          await profileService.uploadPhoto(portrait);
        } catch {
          // No profile yet, or the upload failed. Keep the photo for profile setup.
          rememberVerificationPhoto(portrait);
        }
      }
      session.stop();
      session.navigate(landingPath(user, session.returnTo), { replace: true });
    } catch (err) {
      if (err.status === 422) {
        phaseRef.current = 'camera';
        previousRef.current = null;
        stillCountRef.current = 0;
        setGuide('bad');
        setHint(VERIFICATION_MESSAGES.centerFace);
        setMessage(err.message);
        return;
      }
      session.stop();
      session.abandonVerification(err.status === 401 ? VERIFICATION_MESSAGES.sessionExpired : err.message);
    }
  };

  // Keep sampling the live preview. Capture happens only when one face is
  // inside the marker and has moved since the previous sample.
  useEffect(() => {
    if (camera.status !== 'streaming') return undefined;
    let cancelled = false;
    let timer = 0;
    previousRef.current = null;
    stillCountRef.current = 0;

    const schedule = () => {
      if (cancelled || phaseRef.current !== 'camera') return;
      timer = window.setTimeout(() => {
        void scan();
      }, SCAN_INTERVAL_MS);
    };

    const scan = async () => {
      if (cancelled || phaseRef.current !== 'camera' || scanLock.current) return;
      scanLock.current = true;
      try {
        const frame = await readFrame();
        if (cancelled || phaseRef.current !== 'camera') return;
        if (!frame) return;
        // Use the on-screen oval when it can be measured. A face that fills
        // the oval still counts: only its center has to sit inside the curve.
        const space = markerSpace();
        const box = frame.detection.box ? space.toMarker(frame.detection.box) : undefined;
        const detection = box ? { ...frame.detection, box } : frame.detection;
        const step = nextGuideStep(previousRef.current, detection, space.ellipse, stillCountRef.current);
        if (cancelled || phaseRef.current !== 'camera') return;
        if (step.type === 'pass') {
          const portrait = sessionRef.current.hasProfilePhoto ? null : await frameFile(canvasRef.current);
          if (cancelled || phaseRef.current !== 'camera') return;
          await finish(frame.detection, portrait);
          return;
        }
        clearCapture();
        showStep(step);
      } catch {
        if (!cancelled && phaseRef.current === 'camera') setMessage(VERIFICATION_MESSAGES.detectorFailed);
      } finally {
        scanLock.current = false;
        schedule();
      }
    };

    timer = window.setTimeout(() => {
      void scan();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // readFrame and finish close over refs that stay current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.status]);

  const streaming = camera.status === 'streaming';

  return (
    <section className="card card--narrow">
      <h1>Live verification</h1>
      <p className="muted">
        Center your face in the marker. The photo is taken automatically. This checks that one face is
        present. It does not compare you with your profile picture. If you have no profile picture yet,
        this photo is saved as your profile picture.
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
          hidden={!streaming}
        />
        {streaming && (
          <div className="camera__guide" data-state={guide} data-testid="face-marker" aria-hidden="true">
            <span className="camera__marker" />
          </div>
        )}
        {camera.status === 'requesting' && (
          <p className="muted" role="status">
            Waiting for camera permission…
          </p>
        )}
        {streaming && (
          <p className="camera__status" role="status">
            {hint}
          </p>
        )}
        <canvas ref={canvasRef} hidden />
      </div>

      {camera.status === 'error' && (
        <button type="button" className="btn btn--primary btn--block" onClick={camera.start}>
          Try again
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
