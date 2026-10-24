import { useState } from 'react';

/** Profile picture, or the person's initials when there is none (or it fails to load). */
function Avatar({ src, name, size = 'large' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const initials =
    (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?';

  return src && failedSrc !== src ? (
    <img
      className={`avatar avatar--${size}`}
      src={src}
      alt={name ? `Profile picture of ${name}` : 'Profile picture'}
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <div
      className={`avatar avatar--${size} avatar--placeholder`}
      role="img"
      aria-label={name ? `${name} (no profile picture)` : 'No profile picture'}
    >
      {initials}
    </div>
  );
}

export default Avatar;
