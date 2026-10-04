/**
 * Request schemas for /api/v1/auth. Emails and mobiles are normalised here,
 * so services always receive canonical values.
 */
const { z } = require('./commonValidator');
const config = require('../config/environment');
const { normalizeMobile } = require('../utils/contact');

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128; // bounds the hashing cost per request

const email = z
  .string({ error: 'Email must be a string' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

const mobile = z
  .string({ error: 'Mobile number must be a string' })
  .transform((value, ctx) => {
    const normalised = normalizeMobile(value);
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid mobile number' });
      return z.NEVER;
    }
    return normalised;
  });

const newPassword = z
  .string({ error: 'Password is required' })
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

// Login never applies strength rules, only bounds.
const existingPassword = z.string({ error: 'Password is required' }).min(1, 'Password is required').max(PASSWORD_MAX);

const otp = z
  .string({ error: 'OTP is required' })
  .trim()
  .regex(new RegExp(`^\\d{${config.otp.length}}$`), `OTP must be ${config.otp.length} digits`);

const identifier = z.string({ error: 'Email or mobile number is required' }).trim().min(3).max(254);

/** Exactly one of email / mobile. */
function oneContact(shape = {}) {
  return z
    .object({ email: email.optional(), mobile: mobile.optional(), ...shape })
    .refine((v) => Boolean(v.email) !== Boolean(v.mobile), {
      message: 'Provide either an email or a mobile number',
      path: ['email'],
    });
}

const registerBody = z
  .object({
    email: email.optional(),
    mobile: mobile.optional(),
    password: newPassword,
  })
  .refine((v) => v.email || v.mobile, {
    message: 'Email or mobile number is required',
    path: ['email'],
  });

const sendOtpBody = oneContact();
const verifyOtpBody = oneContact({ otp });

const loginBody = z.object({ identifier, password: existingPassword });
const loginSendOtpBody = z.object({ identifier });
const loginVerifyOtpBody = z.object({ identifier, otp });

/**
 * Result of the in-browser face/human presence check. Strict: any extra field
 * (e.g. an image) is rejected — the backend never accepts camera images.
 */
const completeVerificationBody = z
  .object({
    verification_token: z.string({ error: 'verification_token is required' }).min(20).max(200),
    face_detected: z.boolean({ error: 'face_detected must be true or false' }),
    face_count: z.number({ error: 'face_count must be a number' }).int().min(0).max(50),
    confidence: z.number().min(0).max(1).optional(),
    detector: z.string().max(60).optional(),
  })
  .strict();

module.exports = {
  registerBody,
  sendOtpBody,
  verifyOtpBody,
  loginBody,
  loginSendOtpBody,
  loginVerifyOtpBody,
  completeVerificationBody,
  PASSWORD_MIN,
};
