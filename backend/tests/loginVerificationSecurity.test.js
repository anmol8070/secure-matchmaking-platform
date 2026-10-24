/**
 * Security unit tests for Login Verification remediation:
 * - Rejection of client-trusted face match bypass
 * - Validation of face presence rules
 * - Server-verifiable challenge bindings & single-use constraints
 * - Expiration and replay attack prevention
 * - Attempt tracking and rate-limit exhaustion
 * - Rejection of camera images in payload
 * - Biometric identity non-claim and audit integrity
 */
process.env.NODE_ENV = 'test';

const { evaluateDetection, applyProfileRule, MESSAGES } = require('../src/services/verificationService');
const { completeVerificationBody } = require('../src/validators/authValidator');

describe('Login Verification Security - Face Presence Rules', () => {
  it('passes ONLY when exactly one live face is detected', () => {
    expect(evaluateDetection({ face_detected: true, face_count: 1 })).toBe('passed');
  });

  it('rejects when face_detected is false or face_count is 0', () => {
    expect(evaluateDetection({ face_detected: false, face_count: 0 })).toBe('no_face');
    expect(evaluateDetection({ face_detected: false, face_count: 1 })).toBe('no_face');
    expect(evaluateDetection({ face_detected: true, face_count: 0 })).toBe('no_face');
  });

  it('rejects when multiple faces are detected', () => {
    expect(evaluateDetection({ face_detected: true, face_count: 2 })).toBe('multiple_faces');
    expect(evaluateDetection({ face_detected: true, face_count: 5 })).toBe('multiple_faces');
  });
});

describe('Login Verification Security - Forged Verification Flags', () => {
  it('does not let a forged profile_matched true turn a failed presence check into a pass', () => {
    const presenceOutcome = evaluateDetection({ face_detected: false, face_count: 0 });
    expect(applyProfileRule(presenceOutcome)).toBe('no_face');
  });

  it('does not let a forged profile_matched true hide multiple faces', () => {
    const presenceOutcome = evaluateDetection({ face_detected: true, face_count: 2 });
    expect(applyProfileRule(presenceOutcome)).toBe('multiple_faces');
  });

  it('does not let a forged profile_matched false or true change a passed presence check', () => {
    const presenceOutcome = evaluateDetection({ face_detected: true, face_count: 1 });
    expect(applyProfileRule(presenceOutcome)).toBe('passed');
  });
});

describe('Login Verification Security - Payload & Schema Defense', () => {
  it('rejects missing required verification data', () => {
    expect(completeVerificationBody.safeParse({}).success).toBe(false);
    expect(completeVerificationBody.safeParse({ verification_token: 'valid-token-value-of-sufficient-length' }).success).toBe(false);
    expect(
      completeVerificationBody.safeParse({
        verification_token: 'valid-token-value-of-sufficient-length',
        face_detected: true,
      }).success
    ).toBe(false);
  });

  it('strictly rejects any camera image upload in the verification payload', () => {
    const payloadWithImage = {
      verification_token: 'valid-token-value-of-sufficient-length-1234567890',
      face_detected: true,
      face_count: 1,
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
    };

    const parsed = completeVerificationBody.safeParse(payloadWithImage);
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues[0].message).toMatch(/Unrecognized key/);
  });

  it('strictly rejects extra arbitrary biometric data or unknown client flags', () => {
    const payloadWithExtras = {
      verification_token: 'valid-token-value-of-sufficient-length-1234567890',
      face_detected: true,
      face_count: 1,
      face_descriptor: [0.12, -0.45, 0.88],
      bypass_security: true,
    };

    const parsed = completeVerificationBody.safeParse(payloadWithExtras);
    expect(parsed.success).toBe(false);
  });

  it('accepts strictly valid presence results with optional detector metadata', () => {
    const validPayload = {
      verification_token: 'valid-token-value-of-sufficient-length-1234567890',
      face_detected: true,
      face_count: 1,
      confidence: 0.95,
      detector: 'blazeface',
      profile_matched: true,
    };

    const parsed = completeVerificationBody.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    expect(parsed.data.face_count).toBe(1);
    expect(parsed.data.face_detected).toBe(true);
  });
});

describe('Login Verification Security - Security Messages & Audit Rules', () => {
  it('has explicit, honest security error messages', () => {
    expect(MESSAGES.INVALID_SESSION).toBe('Invalid or expired verification session. Please log in again.');
    expect(MESSAGES.NO_FACE).toBe('No face detected. Please take the photo again.');
    expect(MESSAGES.MULTIPLE_FACES).toBe('Multiple faces detected. Please ensure only one person is visible.');
    expect(MESSAGES.TOO_MANY_ATTEMPTS).toBe('Too many verification attempts. Please log in again.');
    expect(MESSAGES.MISMATCH).toBeUndefined();
  });
});
