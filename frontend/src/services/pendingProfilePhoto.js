/**
 * The live sign-in photo, kept only until it can be saved as the profile
 * picture. Used when the account has no picture yet and no profile to attach
 * it to. It stays in memory for this tab and is never written to disk here.
 */
let pending = null;

export function rememberVerificationPhoto(file) {
  pending = file || null;
}

export function takeVerificationPhoto() {
  const file = pending;
  pending = null;
  return file;
}
