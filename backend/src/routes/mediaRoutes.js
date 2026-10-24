/**
 * Secure media delivery for profile photos.
 *
 * Enforces access control and privacy settings:
 * 1. Strict filename validation preventing path traversal.
 * 2. Short-lived signed URLs via ?exp=<ms>&sig=<hmac>.
 * 3. Authenticated Bearer tokens with privacy setting enforcement
 *    (everyone, connections, nobody) and block relationship checks.
 * 4. "everyone" means any signed-in member. Anonymous requests need a short-lived signature.
 * 5. 404 for deleted or non-existent photos.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const { getDb } = require('../config/database');
const { FILENAME_PATTERN, verifyProfilePhotoSignature, decidePhotoAccess } = require('../services/storage/photoSignature');

async function getProfilePhoto(req, res) {
  const { filename } = req.params;

  // 1. Strict path traversal prevention: must match UUID.webp
  if (!FILENAME_PATTERN.test(filename || '')) {
    return res.status(400).json({ success: false, message: 'Invalid media key' });
  }

  const root = path.resolve(config.media.uploadsDir, 'profile-photos');
  const filePath = path.resolve(root, filename);

  if (!filePath.startsWith(root + path.sep)) {
    return res.status(400).json({ success: false, message: 'Invalid media key' });
  }

  // 2. Check if the file exists on disk
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Profile photo not found' });
  }

  // 3. Database lookup for photo owner
  const db = getDb();
  const relUrl = `/media/profile-photos/${filename}`;
  const profile = await db('profiles').where({ profile_photo_url: relUrl }).first();

  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile photo not found' });
  }

  const ownerId = profile.user_id;

  // Helper to serve the file
  const sendPhoto = () => {
    res.set({
      'Content-Type': 'image/webp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
    return res.sendFile(filePath);
  };

  const { exp, sig } = req.query;
  const signature = exp || sig ? verifyProfilePhotoSignature(filename, exp, sig) : null;

  const authHeader = req.headers.authorization;
  let requesterId = null;
  let requesterRole = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const decoded = jwt.verify(token, config.jwtSecret(), { algorithms: ['HS256'] });
      if (decoded.typ === 'access' && decoded.jti) {
        const session = await db('user_sessions').where({ token_id: decoded.jti }).first();
        if (session && !session.revoked_at && new Date(session.expires_at) > new Date()) {
          requesterId = decoded.user_id;
          requesterRole = decoded.role;
        }
      }
    } catch {
      // Invalid or expired token. Fall through to the access decision.
    }
  }

  let blocked = false;
  let connected = false;
  if (requesterId !== null && Number(requesterId) !== Number(ownerId) && requesterRole !== 'admin') {
    const blockRow = await db('blocks')
      .where(function () {
        this.where({ blocker_id: ownerId, blocked_id: requesterId }).orWhere({
          blocker_id: requesterId,
          blocked_id: ownerId,
        });
      })
      .first();
    blocked = Boolean(blockRow);
    if (!blocked) {
      const connection = await db('connection_requests')
        .where({ status: 'accepted' })
        .where(function () {
          this.where({ sender_id: ownerId, receiver_id: requesterId }).orWhere({
            sender_id: requesterId,
            receiver_id: ownerId,
          });
        })
        .first();
      connected = Boolean(connection);
    }
  }

  const privacy = await db('privacy_settings').where({ user_id: ownerId }).first();
  const decision = decidePhotoAccess({
    signature,
    requesterId,
    role: requesterRole,
    ownerId,
    visibility: privacy?.photo_visibility || 'everyone',
    connected,
    blocked,
  });

  if (decision.status === 200) return sendPhoto();
  return res.status(decision.status).json({ success: false, message: decision.message });
}

module.exports = { getProfilePhoto };

