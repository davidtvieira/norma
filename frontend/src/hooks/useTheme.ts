import { useEffect, useState } from 'react';

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
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures — theme still applies for this session.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }

  return { theme, toggleTheme };
}
