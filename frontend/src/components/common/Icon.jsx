/**
 * Line icons (24×24, stroke = currentColor). Decorative by default: pass
 * `label` only when the icon is the sole content of a control.
 */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm10 9v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
  message: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  video: 'M3 7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm13 3.5 5-3v9l-5-3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zm-3.5 9 2.5 2.5 4.5-5',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4m4 4H3',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  heart: 'M12 20s-7.5-4.6-9.3-9.3C1.4 7.4 3.5 4 7 4c2 0 3.3 1 5 3 1.7-2 3-3 5-3 3.5 0 5.6 3.4 4.3 6.7C19.5 15.4 12 20 12 20z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zm-7 9a7 7 0 0 0 14 0M12 19v3',
  micOff: 'M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M19 12a7 7 0 0 1-1.1 3.8M5 12a7 7 0 0 0 10.4 6.1M12 19v3',
  camera: 'M4 8a1 1 0 0 1 1-1h3l1.5-2h5L16 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  cameraOff: 'M3 3l18 18M7 7H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h13M10 5h4.5L16 7h3a1 1 0 0 1 1 1v9',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  arrowDown: 'M12 5v14m-6-6 6 6 6-6',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  cpu: 'M8 8h8v8H8zM4 9h2m-2 6h2m12-6h2m-2 6h2M9 4v2m6-2v2M9 18v2m6-2v2',
  lock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 8 0v3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  send: 'M4 12 20 4l-6 16-3-7z',
  image: 'M4 5h16v14H4zm0 11 4.5-4.5 3.5 3.5 2.5-2.5L20 17M15 9.5a1 1 0 1 0 0-.01',
  check: 'M5 12.5 10 17 19 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4.5l3 2',
};

function Icon({ name, size = 20, label, className = '', ...rest }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export default Icon;
