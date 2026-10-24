/**
 * Light / dark theme.
 *
 * Until the member picks a theme the operating-system setting is followed (and
 * tracked live). A choice is remembered in localStorage under `mm.theme` — a
 * display preference only, never anything sensitive. index.html applies the
 * same rule before React loads, so the page never flashes the wrong theme.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';

export const THEME_STORAGE_KEY = 'mm.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStored() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // storage blocked (private mode, policy): fall back to the system theme
  }
}

const systemTheme = () => (window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light');
const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const ThemeContext = createContext({ theme: 'light', preference: null, toggleTheme: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStored);
  const [system, setSystem] = useState(systemTheme);
  const theme = preference || system;

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query?.addEventListener) return undefined;
    const onChange = (event) => setSystem(event.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  const setTheme = useCallback((next, origin) => {
    const apply = () => {
      flushSync(() => setPreference(next));
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* not persisted; the choice still applies to this visit */
      }
    };
    // A circular reveal from the toggle where the browser supports view transitions.
    if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
      if (origin) {
        document.documentElement.style.setProperty('--theme-x', `${origin.x}px`);
        document.documentElement.style.setProperty('--theme-y', `${origin.y}px`);
      }
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }, []);

  const toggleTheme = useCallback((origin) => setTheme(theme === 'dark' ? 'light' : 'dark', origin), [theme, setTheme]);

  const value = useMemo(() => ({ theme, preference, setTheme, toggleTheme }), [theme, preference, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
