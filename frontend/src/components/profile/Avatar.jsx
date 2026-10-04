/** Profile picture, or the person's initials when there is none. */
function Avatar({ src, name, size = 'large' }) {
  const initials =
    (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?';

  return src ? (
    <img className={`avatar avatar--${size}`} src={src} alt={name ? `Profile picture of ${name}` : 'Profile picture'} />
  ) : (
    <div className={`avatar avatar--${size} avatar--placeholder`} role="img" aria-label="No profile picture">
      {initials}
    </div>
  );
}

export default Avatar;
