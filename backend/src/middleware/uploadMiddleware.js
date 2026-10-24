/**
 * Multipart upload handling (multer, kept in memory — the file is validated
 * and re-encoded before anything is written to storage).
 *
 *   PUT  /api/v1/profile/photo     multipart/form-data   field: "photo"
 *   POST /api/v1/messages/images   multipart/form-data   fields: "image", receiverId, caption
 */
const multer = require('multer');
const config = require('../config/environment');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');

const FIELD = 'photo';
const maxBytes = () => Math.round(config.profileImage.maxSizeMb * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes(), files: 1, fields: 5, parts: 6 },
}).single(FIELD);

function uploadProfileImage(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new ApiError(HTTP.PAYLOAD_TOO_LARGE, `Image is too large. The maximum size is ${config.profileImage.maxSizeMb} MB.`)
      );
    }
    if (err instanceof multer.MulterError) {
      return next(ApiError.badRequest(`Send one image in the "${FIELD}" form field (multipart/form-data).`));
    }
    // Malformed multipart body
    return next(ApiError.badRequest('The upload could not be read. Please try again.'));
  });
}

/* ---------- Chat images (Phase 11) ---------- */

const CHAT_FIELD = 'image';
const chatMaxBytes = () => Math.round(config.chatImages.maxSizeMb * 1024 * 1024);

const chatUpload = multer({
  storage: multer.memoryStorage(),
  // One file plus the receiverId and caption text fields.
  limits: { fileSize: chatMaxBytes(), files: 1, fields: 3, parts: 4, fieldSize: 16 * 1024 },
}).single(CHAT_FIELD);

function uploadChatImage(req, res, next) {
  chatUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new ApiError(HTTP.PAYLOAD_TOO_LARGE, `Image is too large. The maximum size is ${config.chatImages.maxSizeMb} MB.`)
      );
    }
    if (err instanceof multer.MulterError) {
      return next(ApiError.badRequest(`Send one image in the "${CHAT_FIELD}" form field (multipart/form-data).`));
    }
    return next(ApiError.badRequest('The upload could not be read. Please try again.'));
  });
}

module.exports = { uploadProfileImage, uploadChatImage, FIELD, CHAT_FIELD };
