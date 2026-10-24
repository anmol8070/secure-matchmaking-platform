/**
 * Hero centerpiece with a graceful fallback. The SVG version is always
 * rendered first (and stays if WebGL is missing or fails); the three.js scene
 * is fetched as a separate chunk only when the browser can draw it.
 */
import { Suspense, lazy, useCallback, useEffect, useId, useState } from 'react';

const HeroScene = lazy(() => import('./HeroScene.jsx'));

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    // Test environments stub getContext; a real context has getParameter.
    const ok = Boolean(gl && typeof gl.getParameter === 'function');
    gl?.getExtension?.('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/** Static two-orbs-and-constellation illustration (no WebGL needed). */
export function HeroFallback() {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="hero-fallback" viewBox="0 0 600 480" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`hero-orb-a-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#E9D5FF" />
          <stop offset="0.45" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#3B0F86" />
        </radialGradient>
        <radialGradient id={`hero-orb-b-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFE4F1" />
          <stop offset="0.45" stopColor="#FF3D9A" />
          <stop offset="1" stopColor="#B3134F" />
        </radialGradient>
        <linearGradient id={`hero-link-${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.5" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#FF3D9A" />
        </linearGradient>
      </defs>
      <g className="hero-fallback__sky">
        {[
          [60, 80], [140, 40], [250, 70], [360, 30], [470, 60], [550, 120], [40, 220], [570, 250],
          [70, 380], [160, 430], [300, 450], [430, 420], [540, 380], [300, 20],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3.5 : 2.2} className={`hero-fallback__node hero-fallback__node--${i % 4}`} />
        ))}
        <path d="M60 80 140 40 250 70 360 30 470 60 550 120M40 220 70 380 160 430 300 450 430 420 540 380 570 250" className="hero-fallback__lines" />
      </g>
      <path d="M185 235 Q300 110 415 245" className="hero-fallback__link" stroke={`url(#hero-link-${id})`} />
      <path d="M415 245 Q300 370 185 235" className="hero-fallback__link hero-fallback__link--back" stroke={`url(#hero-link-${id})`} />
      <circle cx="185" cy="235" r="78" fill={`url(#hero-orb-a-${id})`} className="hero-fallback__orb" />
      <circle cx="415" cy="245" r="78" fill={`url(#hero-orb-b-${id})`} className="hero-fallback__orb hero-fallback__orb--b" />
      <ellipse cx="185" cy="235" rx="112" ry="34" className="hero-fallback__ring" transform="rotate(-18 185 235)" />
      <ellipse cx="415" cy="245" rx="112" ry="34" className="hero-fallback__ring hero-fallback__ring--b" transform="rotate(14 415 245)" />
    </svg>
  );
}

function HeroVisual() {
  const [webgl, setWebgl] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (supportsWebGL()) setWebgl(true);
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => {
    setReady(false);
    setWebgl(false);
  }, []);

  return (
    <div
      className={`hero-visual${ready ? ' hero-visual--live' : ''}`}
      role="img"
      aria-label="Illustration: two glowing spheres joined by streams of light, surrounded by a constellation of connected points"
    >
      <HeroFallback />
      {webgl && (
        <Suspense fallback={null}>
          <HeroScene onReady={onReady} onError={onError} />
        </Suspense>
      )}
    </div>
  );
}

export default HeroVisual;
