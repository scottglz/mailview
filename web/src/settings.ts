// This installation's UI settings, put into the page by the server (server/page.ts). The Vite dev server serves the
// page without them, so the defaults below apply there.
export interface UiSettings {
  appName: string;
  tagline: string;
  signInLabel: string;
  signInIcon: 'google' | 'none';
  remoteImages: 'allow' | 'ask';
}

const DEFAULTS: UiSettings = {
  appName: 'Mail archive',
  tagline: 'A searchable, read-only copy of your email.',
  signInLabel: 'Sign in',
  signInIcon: 'none',
  remoteImages: 'ask',
};

function read(): UiSettings {
  try {
    const text = document.getElementById('mv-settings')?.textContent;
    return text ? { ...DEFAULTS, ...(JSON.parse(text) as Partial<UiSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export const settings: UiSettings = read();
