/**
 * Message payload schemas, shared by the REST routes and the Socket.IO
 * handlers so both paths accept exactly the same input.
 *
 * Text is trimmed, NUL characters are removed, and the length is bounded.
 * Content is stored as plain text (never HTML); the frontend renders it as
 * text, so markup such as <script> is displayed, not executed.
 */
const config = require('../config/environment');
const { z, id } = require('./commonValidator');

// Types accepted by message:send / POST /messages. Images are sent with
// POST /messages/images (multipart), never inside a JSON or socket payload.
const MESSAGE_TYPES = ['text'];

const messageText = z
  .string({ error: 'Message must be text' })
  .transform((value) => value.replace(/\u0000/g, '').trim())
  .pipe(
    z
      .string()
      .min(1, 'Message cannot be empty')
      .max(config.messages.maxLength, `Message cannot be longer than ${config.messages.maxLength} characters`)
  );

const sendMessageBody = z.object({
  receiverId: id(),
  message: messageText,
  type: z
    .string()
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(MESSAGE_TYPES, { error: 'Unsupported message type' }))
    .default('text'),
});

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(config.messages.maxLimit).default(config.messages.defaultLimit),
  // Message id cursor: return messages older than this one.
  before: id().optional(),
});

/** Multipart text fields of POST /messages/images (the file is the "image" field). */
const imageMessageBody = z.object({
  receiverId: id(),
  caption: z
    .string()
    .transform((value) => value.replace(/\u0000/g, '').trim())
    .pipe(z.string().max(config.messages.maxLength, `Caption cannot be longer than ${config.messages.maxLength} characters`))
    .default(''),
});

const messageIdParams = z.object({ id: id() });
const userTarget = z.object({ userId: id() });
const readPayload = z.object({ messageId: id() });

module.exports = { MESSAGE_TYPES, sendMessageBody, imageMessageBody, historyQuery, messageIdParams, userTarget, readPayload };
