/**
 * File storage integration point (selected with STORAGE_PROVIDER).
 *
 * A provider exposes:
 *   put(key, buffer, contentType) → { key, url }   url is stored in the database
 *   remove(key)                    → deletes the object (missing objects are fine)
 *   keyFromUrl(url)                → key for a stored url, or null
 *
 * To add cloud storage (S3, GCS, Azure, Cloudinary…): implement these three
 * functions in <name>StorageProvider.js, register it below and set
 * STORAGE_PROVIDER plus the provider's credentials in .env. Credentials stay
 * server-side; only the resulting URL is stored and returned.
 */
const config = require('../../config/environment');

const PROVIDERS = {
  local: () => require('./localStorageProvider'),
};

function getStorage(name = config.media.storageProvider) {
  const factory = PROVIDERS[name];
  if (!factory) throw new Error(`Unknown STORAGE_PROVIDER "${name}"`);
  return factory();
}

/** Absolute URL for a stored reference (relative paths are served by this API). */
function toPublicUrl(storedUrl) {
  if (!storedUrl) return null;
  return storedUrl.startsWith('/') ? `${config.media.publicBaseUrl}${storedUrl}` : storedUrl;
}

module.exports = { getStorage, toPublicUrl };
