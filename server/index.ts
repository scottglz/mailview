// mailview: a read-only web UI over Mail-Archiver's REST API. See README.md.
//
// Every request goes to Mail-Archiver with the signed-in person's OWN API key (their own Mail-Archiver user), so
// Mail-Archiver decides which mailboxes they can see and its Access Logs name them. This app adds no access rules
// of its own beyond "who is this person".
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { apiBackend, UpstreamError } from './api.ts';
import { Auth } from './auth.ts';
import type { AuthEnv } from './auth.ts';
import type { Backend, Detail } from './backend.ts';
import { TtlCache } from './cache.ts';
import { loadConfig } from './config.ts';
import { demoBackend } from './demo.ts';
import { attachmentHeaders, contentDisposition, previewType } from './files.ts';
import { bodyCsp, emailDocument, hasRemoteContent, normalizeCid, referencedCids } from './html.ts';
import { parseOriginal } from './mime.ts';
import { withSettings } from './page.ts';
import type { ParsedOriginal, Person } from './mime.ts';

const cfg = loadConfig();
const auth = new Auth(cfg);

const demo = cfg.demo ? demoBackend() : null;
const backends = new Map<string, Backend>();
function backendFor(label: string): Backend {
  if (demo) return demo;
  let b = backends.get(label);
  if (!b) {
    b = apiBackend(cfg.apiUrl, cfg.keys.get(label)!);
    backends.set(label, b);
  }
  return b;
}

// Cached per person ("label:id"). A message detail is reused by the body/attachment requests that follow opening it,
// so one view is one "Open" in Mail-Archiver's log.
const details = new TtlCache<Detail | null>(100, 2 * 60_000);
const originals = new TtlCache<ParsedOriginal | null>(20, 5 * 60_000);

const app = new Hono<AuthEnv>();

app.onError((err, c) => {
  console.error(err instanceof Error ? err.message : 'error');
  return c.json({ error: 'upstream' }, err instanceof UpstreamError ? 502 : 500);
});

app.get('/healthz', (c) => c.text('ok'));

app.get('/auth/login', (c) => auth.login(c));
app.get('/auth/callback', (c) => auth.callback(c));
app.post('/auth/logout', (c) => auth.logout(c));

// ---- API (signed-in only) -----------------------------------------------------------------------------------------

const api = new Hono<AuthEnv>();
api.use('*', auth.requireSession());
api.use('*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  if (!c.res.headers.get('cache-control')) c.header('cache-control', 'no-store');
});

function label(c: Context<AuthEnv>): string {
  return auth.labelFor(c.get('session')) ?? 'demo';
}

function intParam(value: string | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null;
  return Number(value);
}

/** The message, if it exists and Mail-Archiver lets this person see it (404 from the API otherwise). */
async function loadMessage(c: Context<AuthEnv>): Promise<Detail | null> {
  const id = intParam(c.req.param('id'));
  if (id === null) return null;
  const who = label(c);
  return details.get(`${who}:${id}`, () => backendFor(who).message(id));
}

/** The parsed original. Mail-Archiver logs this as a Download, so it's only fetched for inline images. */
function loadOriginal(c: Context<AuthEnv>, id: number): Promise<ParsedOriginal | null> {
  const who = label(c);
  return originals.get(`${who}:${id}`, async () => {
    const bytes = await backendFor(who).original(id);
    return bytes ? parseOriginal(bytes) : null;
  });
}

function splitAddresses(list: string): Person[] {
  return list
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((address) => ({ name: '', address }));
}

api.get('/me', async (c) => {
  const accounts = await backendFor(label(c)).accounts();
  return c.json({ accounts, demo: cfg.demo });
});

api.get('/accounts/:id/folders', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ error: 'not-found' }, 404);
  return c.json(await backendFor(label(c)).folders(id));
});

api.get('/messages', async (c) => {
  const q = c.req.query();
  const accountId = intParam(q.account);
  if (accountId === null) return c.json({ error: 'not-found' }, 404);
  const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const page = await backendFor(label(c)).search({
    accountId,
    q: q.q?.trim().slice(0, 500) || undefined,
    folder: q.folder || undefined,
    direction: q.direction === 'incoming' || q.direction === 'outgoing' ? q.direction : undefined,
    from: date(q.from),
    to: date(q.to),
    page: Math.max(1, Math.min(10_000, intParam(q.page) ?? 1)),
    pageSize: 50,
    sortOrder: q.sort === 'asc' ? 'asc' : 'desc',
  });
  return c.json(page);
});

api.get('/messages/:id', async (c) => {
  const d = await loadMessage(c);
  if (!d) return c.json({ error: 'not-found' }, 404);
  const html = d.htmlBody?.trim() ? d.htmlBody : null;
  const cids = html ? referencedCids(html) : new Set<string>();
  // Inline images need the original (the API's attachment list has no Content-ID). Its display names are NOT used:
  // the list can only show addresses (the API has no names), and a reader that showed names for some emails but
  // not others looked inconsistent. Names come when the API provides them.
  const orig = cids.size > 0 && d.hasRawMessage ? await loadOriginal(c, d.id).catch(() => null) : null;
  const inlineNames = new Set(
    [...(orig?.inline ?? new Map())].filter(([cid]) => cids.has(cid)).map(([, part]) => part.fileName),
  );
  return c.json({
    id: d.id,
    accountId: d.accountId,
    subject: d.subject,
    sentDate: d.sentDate,
    folderName: d.folderName,
    isOutgoing: d.isOutgoing,
    from: { name: '', address: d.from },
    to: splitAddresses(d.to),
    cc: splitAddresses(d.cc),
    bcc: splitAddresses(d.bcc),
    replyTo: [],
    hasHtml: html !== null,
    hasRemoteContent: html ? hasRemoteContent(html) : false,
    text: html ? null : (d.textBody ?? ''),
    hasOriginal: d.hasRawMessage,
    attachments: d.attachments.map((a) => ({
      ...a,
      preview: previewType(a.contentType, a.fileName)?.kind ?? null,
      inline: inlineNames.has(a.fileName) && previewType(a.contentType, a.fileName)?.kind === 'image',
    })),
  });
});

api.get('/messages/:id/body', async (c) => {
  const d = await loadMessage(c);
  if (!d?.htmlBody) return c.text('Not found', 404);
  const allowRemote = c.req.query('images') === '1';
  const doc = emailDocument(d.htmlBody, (cid) => `/api/messages/${d.id}/cid/${encodeURIComponent(cid)}`);
  return c.body(doc, 200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': bodyCsp(allowRemote),
    'referrer-policy': 'no-referrer',
    'cache-control': 'private, max-age=300',
  });
});

api.get('/messages/:id/cid/:cid', async (c) => {
  const d = await loadMessage(c);
  if (!d) return c.body(null, 404);
  const part = (await loadOriginal(c, d.id))?.inline.get(normalizeCid(c.req.param('cid')));
  if (!part) return c.body(null, 404);
  return c.body(part.bytes as Uint8Array<ArrayBuffer>, 200, {
    'content-type': part.contentType,
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': 'private, max-age=3600',
  });
});

api.get('/messages/:id/attachments/:attId', async (c) => {
  const d = await loadMessage(c);
  const attId = intParam(c.req.param('attId'));
  const meta = d?.attachments.find((a) => a.id === attId);
  if (!d || !meta) return c.json({ error: 'not-found' }, 404);
  const bytes = await backendFor(label(c)).attachment(d.id, meta.id);
  if (!bytes) return c.json({ error: 'not-found' }, 404);
  return c.body(bytes as Uint8Array<ArrayBuffer>, 200, attachmentHeaders(meta.contentType, meta.fileName, c.req.query('view') === '1'));
});

api.get('/messages/:id/original', async (c) => {
  const d = await loadMessage(c);
  if (!d) return c.json({ error: 'not-found' }, 404);
  const bytes = await backendFor(label(c)).original(d.id);
  if (!bytes) return c.json({ error: 'not-found' }, 404);
  const name = `${(d.subject || 'message').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'message'}.eml`;
  return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
    'content-type': 'application/octet-stream',
    'content-disposition': contentDisposition('attachment', name),
    'content-security-policy': "default-src 'none'; sandbox",
  });
});

api.all('*', (c) => c.json({ error: 'not-found' }, 404));
app.route('/api', api);


// ---- the web app ----------------------------------------------------------------------------------------------------

const staticRoot = resolve(cfg.staticDir);
const issuerOrigin = cfg.demo ? '' : ` ${new URL(cfg.oidc.issuer).origin}`;
const APP_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Sign-out is a form POST that may redirect to the sign-in provider's logout page.
    `form-action 'self'${issuerOrigin}`,
    "frame-ancestors 'none'",
  ].join('; '),
  // Popups opened from email links can't reach back into this page (reverse tabnabbing).
  'cross-origin-opener-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

app.use(
  '/assets/*',
  serveStatic({
    root: staticRoot,
    onFound: (_path, c) => {
      c.header('cache-control', 'public, max-age=31536000, immutable');
      c.header('x-content-type-options', 'nosniff');
    },
  }),
);
app.use('/favicon.svg', serveStatic({ root: staticRoot }));

let indexHtml: string | null = null;
app.get('*', async (c) => {
  indexHtml ??= withSettings(await readFile(join(staticRoot, 'index.html'), 'utf8'), cfg.ui);
  return c.html(indexHtml, 200, { ...APP_HEADERS, 'cache-control': 'no-cache' });
});

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`mailview listening on :${info.port}${cfg.demo ? ' (DEMO data, no sign-in)' : ''}`);
});
