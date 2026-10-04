/**
 * /api/v1/dev — DEVELOPMENT-ONLY tooling. Mounted by routes.js only when
 * NODE_ENV !== 'production' AND OTP_PROVIDER=dev.
 *
 *   GET /api/v1/dev/otp?destination=user@example.com   (or a mobile number)
 *
 * Returns the latest code from the dev OTP outbox so registration/login can be
 * tested without an email/SMS provider.
 */
const { Router } = require('express');
const devOtpProvider = require('../services/otpDelivery/devOtpProvider');
const { validate, z } = require('../validators/commonValidator');
const { parseIdentifier } = require('../utils/contact');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

const router = Router();

router.get('/otp', validate({ query: z.object({ destination: z.string().min(3).max(254) }) }), (req, res) => {
  const parsed = parseIdentifier(req.validated.query.destination);
  const message = parsed && devOtpProvider.peek(parsed.value);
  if (!message) throw ApiError.notFound('No OTP in the dev outbox for this destination');

  sendSuccess(res, {
    message: 'Development OTP outbox',
    data: { code: message.code, purpose: message.purpose, channel: message.channel, expires_at: message.expiresAt },
  });
});

module.exports = router;
