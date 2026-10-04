/**
 * Client-side checks for profile pictures — for quick feedback only. The
 * backend re-validates every upload (real file type, size, decodability).
 */
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PROFILE_IMAGE_MAX_MB = Number(import.meta.env.VITE_PROFILE_IMAGE_MAX_SIZE_MB) || 5;

export function validateProfileImage(file) {
  if (!file) return 'Choose an image.';
  if (!PROFILE_IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG or WEBP image.';
  if (file.size > PROFILE_IMAGE_MAX_MB * 1024 * 1024) {
    return `Image is too large. The maximum size is ${PROFILE_IMAGE_MAX_MB} MB.`;
  }
  return null;
}
