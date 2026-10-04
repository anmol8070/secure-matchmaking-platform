/**
 * Face/human PRESENCE detection in the browser (MediaPipe Face Detector,
 * BlazeFace short-range model).
 *
 * It only counts faces in a captured frame. It does not recognise, identify
 * or compare faces, and it never sends the image anywhere — the caller sends
 * just the count to the backend.
 *
 * The WASM runtime and model are loaded on first use from the URLs below
 * (override with VITE_MEDIAPIPE_WASM_URL / VITE_FACE_DETECTOR_MODEL_URL to
 * self-host them).
 */
const WASM_URL =
  import.meta.env.VITE_MEDIAPIPE_WASM_URL || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  import.meta.env.VITE_FACE_DETECTOR_MODEL_URL ||
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export const DETECTOR_NAME = 'mediapipe-blazeface-short-range';
const MIN_CONFIDENCE = 0.6;

let detectorPromise = null;

function loadDetector() {
  detectorPromise ||= (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'IMAGE',
      minDetectionConfidence: MIN_CONFIDENCE,
    });
  })().catch((err) => {
    detectorPromise = null; // allow a retry after a network failure
    throw err;
  });
  return detectorPromise;
}

/** Starts downloading the model early (e.g. when the camera page opens). */
export function preloadFaceDetector() {
  return loadDetector();
}

/**
 * Counts faces in an image source (canvas, image or video frame).
 * @returns {Promise<{ faceCount: number, confidence?: number, detector: string }>}
 */
export async function detectFaces(source) {
  const detector = await loadDetector();
  const { detections } = detector.detect(source);
  const scores = detections.map((d) => d.categories?.[0]?.score ?? 0);
  return {
    faceCount: detections.length,
    ...(scores.length > 0 && { confidence: Math.round(Math.max(...scores) * 1000) / 1000 }),
    detector: DETECTOR_NAME,
  };
}
