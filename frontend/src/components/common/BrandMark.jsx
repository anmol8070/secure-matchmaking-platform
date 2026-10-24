import { useId } from 'react';
import { APP_NAME } from '../../utils/constants.js';

/** Logo: two linked orbits (the product idea, two people connected) and the wordmark. */
function BrandMark({ compact = false, suffix }) {
  const gradient = `brand-mark-${useId().replace(/:/g, '')}`;
  return (
    <span className="brand-mark">
      <svg className="brand-mark__logo" width="34" height="34" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.55" stopColor="#FF3D9A" />
            <stop offset="1" stopColor="#FF6B6B" />
          </linearGradient>
        </defs>
        <circle cx="15" cy="20" r="10" fill="none" stroke={`url(#${gradient})`} strokeWidth="3.2" />
        <circle cx="25" cy="20" r="10" fill="none" stroke={`url(#${gradient})`} strokeWidth="3.2" />
        <circle cx="20" cy="20" r="2.6" className="brand-mark__spark" />
      </svg>
      {!compact && (
        <span className="brand-mark__name">
          {APP_NAME}
          {suffix && <span className="brand-mark__suffix"> {suffix}</span>}
        </span>
      )}
    </span>
  );
}

export default BrandMark;
