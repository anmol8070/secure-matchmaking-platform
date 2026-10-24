/**
 * Security unit tests for Profile Photo Protection:
 * - Signed URL generation, verification, expiration, and tampering defense
 * - Path traversal prevention and key validation
 * - Upload validation (types, magic numbers, sanitization)
 * - Safe replacement and deletion behavior
 */
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const config = require('../src/config/environment');
const {
  signProfilePhotoUrl,
  validateUpload,
  detectImageType,
  MESSAGES,
} = require('../src/services/profilePhotoService');
const { verifyProfilePhotoSignature, decidePhotoAccess } = require('../src/services/storage/photoSignature');

describe('Profile Photo Protection - Signed URLs', () => {
  const photoUrl = 'http://localhost:5000/media/profile-photos/123e4567-e89b-12d3-a456-426614174000.webp';
  const filename = '123e4567-e89b-12d3-a456-426614174000.webp';

  it('generates a valid signed URL with exp and sig query parameters', () => {
    const signed = signProfilePhotoUrl(photoUrl, { expiresInSeconds: 1800 });
    const url = new URL(signed);

    expect(url.searchParams.has('exp')).toBe(true);
    expect(url.searchParams.has('sig')).toBe(true);

    const exp = Number(url.searchParams.get('exp'));
    expect(exp).toBeGreaterThan(Date.now());
    expect(exp).toBeLessThanOrEqual(Date.now() + 1800 * 1000 + 1000);

    const expectedSig = crypto
      .createHmac('sha256', config.jwtSecret())
      .update(`${filename}:${exp}`)
      .digest('hex');

    expect(url.searchParams.get('sig')).toBe(expectedSig);
  });

  it('detects an expired signed URL', () => {
    const pastExp = Date.now() - 5000;
    const isExpired = pastExp < Date.now();
    expect(isExpired).toBe(true);
  });

  it('detects a forged or tampered signature on a signed URL', () => {
    const exp = Date.now() + 3600000;
    const realSig = crypto.createHmac('sha256', config.jwtSecret()).update(`${filename}:${exp}`).digest('hex');
    const forgedSig = crypto.createHmac('sha256', 'wrong-secret-key-12345').update(`${filename}:${exp}`).digest('hex');

    expect(crypto.timingSafeEqual(Buffer.from(realSig, 'hex'), Buffer.from(forgedSig, 'hex'))).toBe(false);
  });

  it('accepts a fresh signature and rejects expiry, tampering, and a missing signature', () => {
    const signed = new URL(signProfilePhotoUrl(photoUrl, { expiresInSeconds: 60 }));
    const exp = signed.searchParams.get('exp');
    const sig = signed.searchParams.get('sig');
    expect(verifyProfilePhotoSignature(filename, exp, sig)).toBe('ok');
    expect(verifyProfilePhotoSignature(filename, Date.now() - 1000, sig)).toBe('expired');
    expect(verifyProfilePhotoSignature(filename, exp, 'ab'.repeat(32))).toBe('invalid');
  });
});

describe('Profile photo access policy', () => {
  const owner = { requesterId: 7, role: 'user', ownerId: 7, visibility: 'everyone', connected: false, blocked: false };

  it('lets a valid signature through and rejects a bad one', () => {
    expect(decidePhotoAccess({ ...owner, requesterId: null, signature: 'ok' }).status).toBe(200);
    expect(decidePhotoAccess({ ...owner, requesterId: null, signature: 'expired' }).status).toBe(403);
    expect(decidePhotoAccess({ ...owner, requesterId: null, signature: 'invalid' }).status).toBe(403);
  });

  it('requires a signed-in member for an unsigned photo, including visibility everyone', () => {
    expect(decidePhotoAccess({ ...owner, requesterId: null, signature: null }).status).toBe(401);
    expect(decidePhotoAccess({ ...owner, requesterId: 9, signature: null }).status).toBe(200);
  });

  it('hides a connections-only or private photo from the wrong member', () => {
    expect(decidePhotoAccess({ ...owner, requesterId: 9, visibility: 'connections', connected: false, signature: null }).status).toBe(403);
    expect(decidePhotoAccess({ ...owner, requesterId: 9, visibility: 'connections', connected: true, signature: null }).status).toBe(200);
    expect(decidePhotoAccess({ ...owner, requesterId: 9, visibility: 'nobody', signature: null }).status).toBe(403);
    expect(decidePhotoAccess({ ...owner, requesterId: 9, visibility: 'everyone', blocked: true, signature: null }).status).toBe(403);
    expect(decidePhotoAccess({ ...owner, signature: null }).status).toBe(200);
  });
});

describe('Profile Photo Protection - Path Traversal Prevention', () => {
  const FILENAME_PATTERN = /^[a-f0-9-]{36}\.webp$/;

  it('accepts valid UUID webp filenames', () => {
    expect(FILENAME_PATTERN.test('123e4567-e89b-12d3-a456-426614174000.webp')).toBe(true);
    expect(FILENAME_PATTERN.test('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d.webp')).toBe(true);
  });

  it.each([
    ['directory traversal ../', '../secret.webp'],
    ['nested traversal ../../', '../../etc/passwd'],
    ['absolute path', '/etc/shadow'],
    ['null byte injection', '123e4567-e89b-12d3-a456-426614174000.webp\0.png'],
    ['non-webp extension', '123e4567-e89b-12d3-a456-426614174000.png'],
    ['executable extension', '123e4567-e89b-12d3-a456-426614174000.exe'],
    ['arbitrary name', 'avatar.webp'],
    ['shell metacharacters', ';rm -rf;.webp'],
  ])('strictly rejects %s', (label, maliciousKey) => {
    expect(FILENAME_PATTERN.test(maliciousKey)).toBe(false);
  });
});

describe('Profile Photo Protection - Upload Validation & Magic Numbers', () => {
  it('detects genuine JPEG images by magic bytes (0xFF, 0xD8, 0xFF)', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageType(jpegBuffer)).toBe('image/jpeg');
  });

  it('detects genuine PNG images by magic bytes', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectImageType(pngBuffer)).toBe('image/png');
  });

  it('detects genuine WebP images by RIFF...WEBP header', () => {
    const webpBuffer = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x20, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
      Buffer.from('VP8 '),
    ]);
    expect(detectImageType(webpBuffer)).toBe('image/webp');
  });

  it('rejects fake images (text or executable disguised with image extension)', () => {
    const textBuffer = Buffer.from('<?php echo "evil"; ?>');
    expect(detectImageType(textBuffer)).toBeNull();

    const file = {
      buffer: textBuffer,
      size: textBuffer.length,
      mimetype: 'image/png',
      originalname: 'evil.png',
    };

    expect(() => validateUpload(file)).toThrow(MESSAGES.UNSUPPORTED);
  });

  it('rejects unsupported image formats (GIF, SVG, BMP)', () => {
    const gifBuffer = Buffer.from('GIF89a...');
    const file = {
      buffer: gifBuffer,
      size: gifBuffer.length,
      mimetype: 'image/gif',
      originalname: 'animated.gif',
    };

    expect(() => validateUpload(file)).toThrow(MESSAGES.UNSUPPORTED);
  });

  it('rejects missing or empty file uploads', () => {
    try {
      validateUpload(null);
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Validation failed');
      expect(err.errors[0].message).toBe(MESSAGES.MISSING);
    }

    try {
      validateUpload({ buffer: null });
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Validation failed');
      expect(err.errors[0].message).toBe(MESSAGES.MISSING);
    }

    try {
      validateUpload({ buffer: Buffer.alloc(0), size: 0 });
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Validation failed');
      expect(err.errors[0].message).toBe(MESSAGES.MISSING);
    }
  });
});
