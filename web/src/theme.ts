// Light / dark theme. Follows the system setting until someone clicks the theme button; that choice is remembered in
// this browser (localStorage, best effort) and set as data-theme on <html>, which styles.css reads.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'mailview-theme';
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Call before the first render so a remembered choice doesn't flash the other theme. */
export function applyStoredTheme(): void {
  const t = stored();
  if (t) document.documentElement.dataset.theme = t;
}

export function useTheme(): [Theme, () => void] {
  const [choice, setChoice] = useState<Theme | null>(stored);
  const [system, setSystem] = useState<Theme>(systemDark() ? 'dark' : 'light');

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = choice ?? system;
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setChoice(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private window or storage blocked: the choice lasts until the page is reloaded
    }
  };
  return [theme, toggle];
}
