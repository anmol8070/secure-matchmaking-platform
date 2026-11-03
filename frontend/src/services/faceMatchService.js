/**
 * Face MATCHING for login: compare a live camera frame with the saved
 * profile picture using face-api recognition descriptors.
 *
 * Presence (one face in the marker) still comes from faceDetectionService.
 * This module only answers "does this live face look like the profile photo?".
 */
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL =
  import.meta.env.VITE_FACEAPI_MODEL_URL ||
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

/** Euclidean distance below this counts as the same person (FaceRecognitionNet). */
export const MATCH_THRESHOLD = 0.55;

export const MATCHER_NAME = 'face-api-recognition-net';

let modelsPromise = null;

function loadModels() {
  modelsPromise ||= Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]).catch((err) => {
    modelsPromise = null;
    throw err;
  });
  return modelsPromise;
}

/** Starts downloading recognition models early (login verification page). */
export function preloadFaceMatcher() {
  return loadModels();
}

function detectorOptions() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
}

/**
 * 128-d face descriptor for one image/canvas/video frame.
 * @returns {Promise<Float32Array|null>}
 */
export async function getFaceDescriptor(source) {
  await loadModels();
  const result = await faceapi
    .detectSingleFace(source, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result?.descriptor ?? null;
}

async function loadImageElement(url) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Could not load profile picture (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Profile picture could not be decoded'));
      el.src = objectUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Loads the profile picture once and returns its descriptor for later compares.
 * @returns {Promise<Float32Array>}
 */
export async function loadProfileDescriptor(profilePhotoUrl) {
  if (!profilePhotoUrl) throw new Error('No profile picture URL for face matching');
  const img = await loadImageElement(profilePhotoUrl);
  const descriptor = await getFaceDescriptor(img);
  if (!descriptor) {
    throw new Error('No face found in the saved profile picture. Update your profile photo and try again.');
  }
  return descriptor;
}

/**
 * Compare a live frame to a previously loaded profile descriptor.
 * @returns {Promise<{ matched: boolean, distance: number|null, matcher: string }>}
 */
export async function matchLiveToDescriptor(liveSource, profileDescriptor) {
  const live = await getFaceDescriptor(liveSource);
  if (!live || !profileDescriptor) {
    return { matched: false, distance: null, matcher: MATCHER_NAME };
  }
  const distance = faceapi.euclideanDistance(live, profileDescriptor);
  return {
    matched: distance <= MATCH_THRESHOLD,
    distance: Math.round(distance * 1000) / 1000,
    matcher: MATCHER_NAME,
  };
}
