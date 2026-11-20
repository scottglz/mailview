// Sign-in with any OpenID Connect provider (Keycloak, Authentik, Authelia, Google, ...): authorization code flow
// with PKCE, state and nonce, as a confidential client. Sessions live in memory: a restart signs everyone out,
// which is fine for a household-sized app.
import { randomBytes } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as oidc from 'openid-client';
import type { Config } from './config.ts';

const SESSION_COOKIE = '__Host-mv';
const LOGIN_COOKIE = '__Host-mv-login';
const SESSION_DAYS = 7;
const LOGIN_TTL_MS = 10 * 60_000;

export interface Session {
  sub: string;
  /** Lowercased, and only if the provider marked it verified; null otherwise. */
  email: string | null;
  idToken: string | null;
  expires: number;
}

interface PendingLogin {
  verifier: string;
  state: string;
  nonce: string;
  returnTo: string;
  expires: number;
}

export type AuthEnv = { Variables: { session: Session } };

/** The ID token's email, lowercased, only when `email_verified` is true (some providers send the string "true"). */
export function verifiedEmail(claims: Record<string, unknown> | undefined): string | null {
  if (!claims) return null;
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  return verified && email ? email : null;
}

/** The person's label from the user list: by user id first, then by verified email. */
export function labelOf(users: Config['users'], session: Pick<Session, 'sub' | 'email'>): string | null {
  return users.bySub.get(session.sub) ?? (session.email ? users.byEmail.get(session.email) : undefined) ?? null;
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

/** Only same-site paths, never "//host" or "/\host". */
export function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

export class Auth {
  private readonly cfg: Config;
  private readonly sessions = new Map<string, Session>();
  private readonly pending = new Map<string, PendingLogin>();
  private oidcConfig: Promise<oidc.Configuration> | null = null;

  constructor(cfg: Config) {
    this.cfg = cfg;
    setInterval(() => this.sweep(), 10 * 60_000).unref();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, s] of this.sessions) if (s.expires < now) this.sessions.delete(k);
    for (const [k, p] of this.pending) if (p.expires < now) this.pending.delete(k);
  }

  // Discovery on first use, so the app starts even while the provider is down; retried after a failure.
  private discovery(): Promise<oidc.Configuration> {
    if (!this.oidcConfig) {
      const { issuer, clientId, clientSecret } = this.cfg.oidc;
      this.oidcConfig = oidc.discovery(new URL(issuer), clientId, clientSecret).catch((err: unknown) => {
        this.oidcConfig = null;
        throw err;
      });
    }
    return this.oidcConfig;
  }

  private cookie(c: Context, name: string, value: string, maxAgeSeconds: number): void {
    setCookie(c, name, value, { path: '/', secure: true, httpOnly: true, sameSite: 'Lax', maxAge: maxAgeSeconds });
  }

  /** The person's label if they're set up (listed in MAILVIEW_USERS and have a key), else null. */
  labelFor(session: Session): string | null {
    const label = labelOf(this.cfg.users, session);
    return label && this.cfg.keys.has(label) ? label : null;
  }

  requireSession(): MiddlewareHandler<AuthEnv> {
    return async (c, next) => {
      if (this.cfg.demo) {
        c.set('session', { sub: [...this.cfg.users.bySub.keys()][0], email: null, idToken: null, expires: Infinity });
        return next();
      }
      const id = getCookie(c, SESSION_COOKIE);
      const session = id ? this.sessions.get(id) : undefined;
      if (!session || session.expires < Date.now() || this.labelFor(session) === null) {
        return c.json({ error: 'signed-out' }, 401);
      }
      c.set('session', session);
      return next();
    };
  }

  async login(c: Context): Promise<Response> {
    if (this.cfg.demo) return c.redirect('/');
    const config = await this.discovery();
    const key = token();
    const login: PendingLogin = {
      verifier: oidc.randomPKCECodeVerifier(),
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      returnTo: safeReturnPath(c.req.query('return')),
      expires: Date.now() + LOGIN_TTL_MS,
    };
    this.pending.set(key, login);
    this.cookie(c, LOGIN_COOKIE, key, LOGIN_TTL_MS / 1000);
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: `${this.cfg.publicUrl}/auth/callback`,
      // Email only when the list has email entries, so id-only setups still request nothing but `openid`.
      scope: this.cfg.users.byEmail.size > 0 ? 'openid email' : 'openid',
      code_challenge: await oidc.calculatePKCECodeChallenge(login.verifier),
      code_challenge_method: 'S256',
      state: login.state,
      nonce: login.nonce,
    });
    return c.redirect(url.href);
  }

  async callback(c: Context): Promise<Response> {
    const key = getCookie(c, LOGIN_COOKIE);
    deleteCookie(c, LOGIN_COOKIE, { path: '/', secure: true });
    const login = key ? this.pending.get(key) : undefined;
    if (key) this.pending.delete(key);
    if (!login || login.expires < Date.now()) return c.redirect('/?signin=expired');

    const config = await this.discovery();
    // Behind a reverse proxy the request URL is http://container:8080/…; the token request needs the public one.
    const current = new URL(`${this.cfg.publicUrl}/auth/callback${new URL(c.req.url).search}`);
    let tokens;
    try {
      tokens = await oidc.authorizationCodeGrant(config, current, {
        pkceCodeVerifier: login.verifier,
        expectedState: login.state,
        expectedNonce: login.nonce,
        idTokenExpected: true,
      });
    } catch (err) {
      console.warn(`sign-in failed: ${err instanceof Error ? err.name : 'error'}`);
      return c.redirect('/?signin=failed');
    }
    const claims = tokens.claims() as Record<string, unknown> | undefined;
    const sub = String(claims?.sub ?? '');
    const session: Session = {
      sub,
      email: verifiedEmail(claims),
      idToken: tokens.id_token ?? null,
      expires: Date.now() + SESSION_DAYS * 86_400_000,
    };
    const label = this.labelFor(session);
    if (label === null) {
      // The log line gives the admin the id to add to MAILVIEW_USERS (the email isn't logged).
      const listed = labelOf(this.cfg.users, session);
      const why = listed ? `"${listed}" has no key` : session.email ? 'not in MAILVIEW_USERS' : 'not in MAILVIEW_USERS, no verified email';
      console.warn(`sign-in refused: user ${sub} is not set up (${why})`);
      return c.redirect('/?signin=no-mailbox');
    }
    const id = token();
    this.sessions.set(id, session);
    this.cookie(c, SESSION_COOKIE, id, SESSION_DAYS * 86_400);
    console.log(`sign-in: ${label}`);
    return c.redirect(login.returnTo);
  }

  async logout(c: Context): Promise<Response> {
    const id = getCookie(c, SESSION_COOKIE);
    const session = id ? this.sessions.get(id) : undefined;
    if (id) this.sessions.delete(id);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
    if (this.cfg.demo || !session?.idToken) return c.redirect('/');
    // Also end the provider's session, or the next "Sign in" would go straight back in. Providers without an
    // end_session_endpoint in their discovery document (Google) throw here: then only our session ends.
    try {
      const url = oidc.buildEndSessionUrl(await this.discovery(), {
        id_token_hint: session.idToken,
        post_logout_redirect_uri: `${this.cfg.publicUrl}/`,
      });
      return c.redirect(url.href);
    } catch {
      return c.redirect('/');
    }
  }
}
