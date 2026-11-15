/** What the web app shows; read from the environment so each installation can word it its own way. */
export interface UiSettings {
  appName: string;
  tagline: string;
  signInLabel: string;
  /** "google" shows Google's logo on the sign-in button (for Google or a broker that goes straight to Google). */
  signInIcon: 'google' | 'none';
  /** "allow": pictures from the internet load with the email. "ask": hidden until the reader clicks "Show pictures". */
  remoteImages: 'allow' | 'ask';
}

export interface Config {
  port: number;
  demo: boolean;
  publicUrl: string;
  oidc: { issuer: string; clientId: string; clientSecret: string };
  apiUrl: string;
  /** The sign-in provider's user id (the ID token's `sub`) → that person's label, e.g. "alice". */
  users: Map<string, string>;
  /** Label → that person's own Mail-Archiver API key (from MAILVIEW_KEY_<LABEL>). */
  keys: Map<string, string>;
  staticDir: string;
  ui: UiSettings;
}

/**
 * MAILVIEW_USERS, e.g. "3f2a…=alice;109876543210=bob": the sign-in provider's user id (`sub`, matched exactly) and a
 * label, ";" between people. Each label needs a key in MAILVIEW_KEY_<LABEL> ("family-member-1" →
 * MAILVIEW_KEY_FAMILY_MEMBER_1): an API key created for that person's own Mail-Archiver user, so Mail-Archiver
 * decides what they may see and its access log names them.
 */
export function parseUsers(value: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of value.split(';').map((s) => s.trim()).filter(Boolean)) {
    const eq = entry.lastIndexOf('=');
    if (eq <= 0) throw new Error('MAILVIEW_USERS: entry without "="');
    const sub = entry.slice(0, eq).trim();
    const label = entry.slice(eq + 1).trim();
    // OIDC allows any ASCII string up to 255 characters; whitespace and ";" can't be written in this list anyway.
    if (!/^[\x21-\x7e]{1,255}$/.test(sub)) throw new Error('MAILVIEW_USERS: user id must be 1-255 visible ASCII characters');
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(label)) throw new Error('MAILVIEW_USERS: labels are lowercase a-z, 0-9 and "-"');
    map.set(sub, label);
  }
  return map;
}

export function keyVariable(label: string): string {
  return `MAILVIEW_KEY_${label.toUpperCase().replace(/-/g, '_')}`;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

function choice<T extends string>(env: NodeJS.ProcessEnv, name: string, allowed: readonly T[], fallback: T): T {
  const v = env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  if (!(allowed as readonly string[]).includes(v)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return v as T;
}

export function loadUiSettings(env: NodeJS.ProcessEnv = process.env): UiSettings {
  return {
    appName: env.APP_NAME?.trim() || 'Mail archive',
    tagline: env.APP_TAGLINE?.trim() || 'A searchable, read-only copy of your email.',
    signInLabel: env.SIGN_IN_LABEL?.trim() || 'Sign in',
    signInIcon: choice(env, 'SIGN_IN_ICON', ['google', 'none'] as const, 'none'),
    remoteImages: choice(env, 'REMOTE_IMAGES', ['allow', 'ask'] as const, 'ask'),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Config {
  const demo = env.MAILVIEW_DEMO === '1' || argv.includes('--demo');
  const port = Number(env.PORT ?? (demo ? 8787 : 8080));
  const staticDir = env.MAILVIEW_STATIC ?? 'dist';
  const ui = loadUiSettings(env);
  if (demo) {
    return {
      port,
      demo,
      publicUrl: env.PUBLIC_URL ?? `http://localhost:${port}`,
      oidc: { issuer: '', clientId: '', clientSecret: '' },
      apiUrl: '',
      users: new Map([['00000000-0000-0000-0000-000000000000', 'demo']]),
      keys: new Map([['demo', 'demo']]),
      staticDir,
      ui,
    };
  }
  const publicUrl = required(env, 'PUBLIC_URL').replace(/\/$/, '');
  if (!publicUrl.startsWith('https://')) throw new Error('PUBLIC_URL must be https');
  const users = parseUsers(required(env, 'MAILVIEW_USERS'));
  const keys = new Map<string, string>();
  for (const label of new Set(users.values())) {
    const key = env[keyVariable(label)]?.trim();
    // A person without a key yet can't sign in, but doesn't stop everyone else.
    if (key && !key.startsWith('change-me')) keys.set(label, key);
    else console.warn(`${keyVariable(label)} is not set: "${label}" can't sign in until it is`);
  }
  return {
    port,
    demo,
    publicUrl,
    oidc: {
      issuer: required(env, 'OIDC_ISSUER'),
      clientId: required(env, 'OIDC_CLIENT_ID'),
      clientSecret: required(env, 'OIDC_CLIENT_SECRET'),
    },
    apiUrl: required(env, 'MAILARCHIVER_API_URL'),
    users,
    keys,
    staticDir,
    ui,
  };
}
