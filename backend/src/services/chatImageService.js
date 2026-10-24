/**
 * Images sent in private chat (Phase 11).
 *
 *   validate (declared type, extension, real file signature)
 *     → re-encode with sharp (auto-rotate, resize, strip EXIF/GPS metadata)
 *     → store in PRIVATE storage under a random key
 *
 * Re-encoding means only pixels are kept: embedded scripts, polyglot
 * payloads and location metadata never reach the receiver. No face or
 * identity processing of any kind is done. Files are never public; they are
 * read back only through messageService.getMessageImage (participants only).
 */
const { randomUUID } = require('crypto');
const path = require('path');
const sharp = require('sharp');
const config = require('../config/environment');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const logger = require('../utils/logger');
const { detectImageType, ALLOWED_TYPES } = require('./profilePhotoService');
const privateStorage = require('./storage/privateLocalStorage');

const FIELD = 'image';
const OUTPUT = { extension: 'webp', contentType: 'image/webp', quality: 82 };
// Rejects decompression bombs (tiny files that expand to huge pixel counts).
const MAX_INPUT_PIXELS = 50_000_000;

const MESSAGES = Object.freeze({
  MISSING: `Choose an image to send (form field "${FIELD}").`,
  UNSUPPORTED: 'Unsupported image type. Use a JPG, PNG or WEBP image.',
  INVALID: 'The file is not a valid image.',
  STORAGE_FAILED: 'Could not save the image right now. Please try again.',
});

/** Throws ApiError unless the upload is an allowed, genuine image. */
function validate(file) {
  if (!file || !file.buffer || file.size === 0) throw ApiError.validation([{ field: FIELD, message: MESSAGES.MISSING }]);
  const extension = path.extname(file.originalname || '').toLowerCase();
  const declaredOk = Boolean(ALLOWED_TYPES[file.mimetype]);
  const extensionOk = Object.values(ALLOWED_TYPES).flat().includes(extension);
  if (!declaredOk || !extensionOk || !detectImageType(file.buffer)) {
    throw new ApiError(HTTP.UNSUPPORTED_MEDIA_TYPE, MESSAGES.UNSUPPORTED);
  }
}

/** Validates and re-encodes; returns { buffer, width, height, size, contentType }. */
async function processImage(file) {
  validate(file);
  const size = config.chatImages.maxDimension;
  try {
    const { data, info } = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: OUTPUT.quality })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, size: data.length, contentType: OUTPUT.contentType };
  } catch {
    throw ApiError.validation([{ field: FIELD, message: MESSAGES.INVALID }], MESSAGES.INVALID);
  }
}

/** Stores a processed image privately; returns its storage key. */
async function store(processed) {
  const key = `chat-images/${randomUUID()}.${OUTPUT.extension}`;
  try {
    await privateStorage.put(key, processed.buffer);
    return key;
  } catch (err) {
    logger.error('Chat image storage failed', { error: err.code || err.name });
    throw ApiError.serviceUnavailable(MESSAGES.STORAGE_FAILED);
  }
}

const read = (key) => privateStorage.read(key);

/** Best-effort removal (e.g. the message row could not be saved). */
async function remove(key) {
  try {
    await privateStorage.remove(key);
  } catch (err) {
    logger.warn('Could not delete chat image', { error: err.code || err.name });
  }
}

module.exports = { processImage, store, read, remove, FIELD, MESSAGES };
