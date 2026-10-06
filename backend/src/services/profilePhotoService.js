/**
 * Profile picture processing and storage.
 *
 * The profile picture is a display image chosen by the user (gallery, file or
 * camera). It may show anything — a face, a group, a landscape. NO face or
 * human detection is performed, and this module has no connection to login
 * verification (verificationService): images are never compared.
 *
 *   validate (declared type, extension, real file signature, size)
 *     → re-encode with sharp (auto-rotate, resize, strip EXIF/GPS metadata)
 *     → store under a random key → return the URL to save in profiles
 */
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const config = require('../config/environment');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const logger = require('../utils/logger');
const { getStorage } = require('./storage');

const ALLOWED_TYPES = Object.freeze({
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
});

const MESSAGES = Object.freeze({
  MISSING: 'Choose an image to upload (form field "photo").',
  UNSUPPORTED: 'Unsupported image type. Use a JPG, PNG or WEBP image.',
  INVALID: 'The file is not a valid image.',
  STORAGE_FAILED: 'Could not save the image right now. Please try again.',
});

const OUTPUT = { format: 'webp', extension: 'webp', contentType: 'image/webp', quality: 85 };
// Rejects decompression bombs (tiny files that expand to huge pixel counts).
const MAX_INPUT_PIXELS = 50_000_000;

/** Detects the real type from the file's first bytes (magic numbers). */
function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Throws ApiError unless the upload is an allowed, genuine image. */
function validateUpload(file) {
  if (!file || !file.buffer || file.size === 0) throw ApiError.validation([{ field: 'photo', message: MESSAGES.MISSING }]);

  const declared = file.mimetype;
  const extension = path.extname(file.originalname || '').toLowerCase();
  const detected = detectImageType(file.buffer);

  const declaredOk = Boolean(ALLOWED_TYPES[declared]);
  const extensionOk = Object.values(ALLOWED_TYPES).flat().includes(extension);
  if (!declaredOk || !extensionOk || !detected) {
    throw new ApiError(HTTP.UNSUPPORTED_MEDIA_TYPE, MESSAGES.UNSUPPORTED);
  }
  return detected;
}

/** Normalises the image: correct orientation, bounded size, no metadata. */
async function normalise(buffer) {
  const size = config.profileImage.maxDimension;
  try {
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate() // apply EXIF orientation before metadata is dropped
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: OUTPUT.quality }) // sharp drops EXIF/GPS/ICC metadata by default
      .toBuffer();
  } catch {
    throw ApiError.validation([{ field: 'photo', message: MESSAGES.INVALID }], MESSAGES.INVALID);
  }
}

/**
 * Validates, processes and stores an uploaded profile picture.
 * @returns {Promise<string>} the URL/reference to store in profiles.profile_photo_url
 */
async function storeProfilePhoto(file) {
  validateUpload(file);
  const processed = await normalise(file.buffer);
  const key = `profile-photos/${randomUUID()}.${OUTPUT.extension}`;
  try {
    const { url } = await getStorage().put(key, processed, OUTPUT.contentType);
    return url;
  } catch (err) {
    logger.error('Profile photo storage failed', { provider: config.media.storageProvider, error: err.message });
    throw ApiError.serviceUnavailable(MESSAGES.STORAGE_FAILED);
  }
}

/** Best-effort removal of a stored photo; failures are logged, never thrown. */
async function deleteStoredPhoto(url) {
  if (!url) return;
  const storage = getStorage();
  const key = storage.keyFromUrl(url);
  if (!key) return;
  try {
    await storage.remove(key);
  } catch (err) {
    logger.warn('Could not delete old profile photo', { error: err.message });
  }
}

module.exports = {
  storeProfilePhoto,
  deleteStoredPhoto,
  validateUpload,
  detectImageType,
  ALLOWED_TYPES,
  MESSAGES,
};
