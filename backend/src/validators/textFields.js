/**
 * Shared building blocks for user-entered text (profile, preferences, quiz).
 *
 * Sanitisation: Unicode NFC, control characters removed, whitespace
 * normalised. Single-line fields reject "<" and ">".
 */
const { z } = require('./commonValidator');

// Letters (any script) with spaces, apostrophes, dots and hyphens — names and places.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
// Places that may list several parts, e.g. "Kolhapur, Maharashtra".
const PLACE_LIST_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .,-]*$/u;

const CONTROL_SINGLE_LINE = /[\u0000-\u001F\u007F]/g;
const CONTROL_MULTI_LINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const cleanLine = (value) =>
  value.normalize('NFC').replace(CONTROL_SINGLE_LINE, ' ').replace(/\s+/g, ' ').trim();

const cleanText = (value) =>
  value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_MULTI_LINE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function text(label, { max, min = 0, multiline = false, pattern, patternMessage } = {}) {
  return z
    .string({ error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be text`) })
    .transform(multiline ? cleanText : cleanLine)
    .refine((v) => v.length >= min, `${label} must be at least ${min} characters`)
    .refine((v) => v.length <= max, `${label} must be at most ${max} characters`)
    .refine((v) => multiline || !/[<>]/.test(v), `${label} contains characters that are not allowed (< or >)`)
    .refine((v) => !pattern || v === '' || pattern.test(v), patternMessage || `${label} contains invalid characters`);
}

/** Optional + clearable: undefined = not provided, null/"" = clear. */
const clearable = (schema) =>
  schema
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

module.exports = { NAME_PATTERN, PLACE_LIST_PATTERN, cleanLine, cleanText, text, clearable };
