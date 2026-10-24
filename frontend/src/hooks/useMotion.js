/**
 * Small motion helpers shared by the landing page and the member pages.
 * Every effect is skipped when the visitor asked for reduced motion, and
 * pointer effects only run for a precise pointer (mouse/pen, not touch).
 */
import { useEffect, useRef } from 'react';

export const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
export const hasFinePointer = () => Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

/**
 * Adds `is-visible` to every `.reveal` inside the returned ref once it scrolls
 * into view. Content is never hidden without this script: the CSS only hides
 * `.reveal` under `html.js`, and browsers without IntersectionObserver (or with
 * reduced motion) get everything visible at once.
 */
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const items = [...root.querySelectorAll('.reveal')];
    if (typeof IntersectionObserver !== 'function' || prefersReducedMotion()) {
      items.forEach((el) => el.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return ref;
}

/**
 * Subtle 3D tilt that follows the pointer. Writes CSS variables only (no React
 * state), so moving the mouse never re-renders the component.
 */
export function useTilt({ max = 6 } = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !hasFinePointer()) return undefined;
    let frame = 0;
    const onMove = (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        el.style.setProperty('--tilt-x', `${(-y * max).toFixed(2)}deg`);
        el.style.setProperty('--tilt-y', `${(x * max).toFixed(2)}deg`);
        el.style.setProperty('--glare-x', `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--glare-y', `${((y + 0.5) * 100).toFixed(1)}%`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    };
    el.classList.add('is-tiltable');
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [max]);
  return ref;
}
