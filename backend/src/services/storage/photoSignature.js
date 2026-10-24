/**
 * Short-lived signatures for profile photos.
 *
 * The database stores a stable path (/media/profile-photos/<uuid>.webp).
 * API responses append exp and sig. The media route accepts that signature
 * for a limited time so an <img> can load without an Authorization header.
 * A signature is a capability minted after the API has already applied
 * privacy rules. It is not a permanent public URL.
 */
const crypto = require('crypto');
const config = require('../../config/environment');

const FILENAME_PATTERN = /^[a-f0-9-]{36}\.webp$/;
const DEFAULT_TTL_SECONDS = 600;

function filenameFromStored(storedUrl) {
  if (!storedUrl || typeof storedUrl !== 'string') return null;
  const pathOnly = storedUrl.split('?')[0];
  const match = pathOnly.match(/\/media\/profile-photos\/([a-f0-9-]{36}\.webp)$/);
  return match ? match[1] : null;
}

function signatureFor(filename, exp) {
  return crypto.createHmac('sha256', config.jwtSecret()).update(`${filename}:${exp}`).digest('hex');
}

function signProfilePhotoUrl(storedUrl, { expiresInSeconds = DEFAULT_TTL_SECONDS, now = Date.now() } = {}) {
  const filename = filenameFromStored(storedUrl);
  if (!filename) return storedUrl || null;
  const exp = now + expiresInSeconds * 1000;
  const sig = signatureFor(filename, exp);
  const pathOnly = `/media/profile-photos/${filename}`;
  return `${config.media.publicBaseUrl}${pathOnly}?exp=${exp}&sig=${sig}`;
}

/** @returns {'ok'|'expired'|'invalid'} */
function verifyProfilePhotoSignature(filename, exp, sig, now = Date.now()) {
  if (!FILENAME_PATTERN.test(filename || '')) return 'invalid';
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return 'invalid';
  if (expNum < now) return 'expired';
  const expected = signatureFor(filename, expNum);
  if (typeof sig !== 'string' || sig.length !== expected.length) return 'invalid';
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    return valid ? 'ok' : 'invalid';
  } catch {
    return 'invalid';
  }
}

/**
 * Access decision for one photo request.
 * A valid signature is a short-lived capability. Without one, the caller
 * must be a signed-in member who is allowed by the owner's photo setting.
 * "everyone" means every signed-in member, not the open internet.
 */
function decidePhotoAccess({ signature, requesterId, role, ownerId, visibility, connected, blocked }) {
  if (signature === 'ok') return { status: 200 };
  if (signature === 'expired') return { status: 403, message: 'Signed URL has expired' };
  if (signature === 'invalid') return { status: 403, message: 'Invalid signed URL signature' };

  const isOwner = requesterId != null && Number(requesterId) === Number(ownerId);
  if (isOwner || role === 'admin') return { status: 200 };
  if (blocked) return { status: 403, message: 'Access denied' };
  if (requesterId == null) return { status: 401, message: 'Sign in to view this photo' };
  if (visibility === 'nobody') return { status: 403, message: 'Access denied' };
  if (visibility === 'connections' && !connected) {
    return { status: 403, message: 'Photo is visible to connections only' };
  }
  return { status: 200 };
}

module.exports = {
  FILENAME_PATTERN,
  DEFAULT_TTL_SECONDS,
  filenameFromStored,
  signProfilePhotoUrl,
  verifyProfilePhotoSignature,
  decidePhotoAccess,
};
