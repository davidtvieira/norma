import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'norma-theme';

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // localStorage unavailable (private browsing, blocked storage) — fall through.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Manual light/dark theme override, persisted across visits and applied via a
 * `data-theme` attribute that the CSS custom properties in index.css key off of.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // The tab icon follows the app's theme: orange on light, white on dark.
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', theme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures — theme still applies for this session.
    }
  }, [theme]);

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduceMotion) {
      setTheme(next);
      return;
    }

    // The new theme is revealed as a circle growing from the top-right corner (where the toggle
    // sits) until it covers the whole screen. The browser snapshots the old page, the callback
    // switches the theme, and the new snapshot is clipped by an expanding circle on top.
    const transition = document.startViewTransition(() => {
      flushSync(() => setTheme(next));
      document.documentElement.setAttribute('data-theme', next);
    });
    const radius = Math.hypot(window.innerWidth, window.innerHeight);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at 100% 0)`, `circle(${radius}px at 100% 0)`] },
          { duration: 500, easing: 'ease-in-out', fill: 'forwards', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {
        // A skipped transition (e.g. the tab was hidden) just changes the theme instantly.
      });
  }

  return { theme, toggleTheme };
}
