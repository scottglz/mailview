import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelOf, safeReturnPath, verifiedEmail } from './auth.ts';
import { keyVariable, labels, loadConfig, loadUiSettings, parseUsers } from './config.ts';
import { attachmentHeaders, previewType } from './files.ts';
import { bodyCsp, emailDocument, hasRemoteContent, referencedCids } from './html.ts';
import { parseOriginal } from './mime.ts';
import { withSettings } from './page.ts';

test('email body CSP blocks scripts and remote content by default', () => {
  const csp = bodyCsp(false);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /sandbox allow-same-origin allow-popups/);
  assert.doesNotMatch(csp, /allow-scripts/);
  assert.doesNotMatch(csp, /https:/);
  assert.match(bodyCsp(true), /img-src 'self' data: https: http:/);
  assert.doesNotMatch(bodyCsp(true), /allow-scripts|script-src/);
});

test('email document rewrites cid: references and drops meta refresh', () => {
  const doc = emailDocument(
    '<meta http-equiv="refresh" content="0;url=https://evil.example"><img src="cid:Logo%40X"><img src=\'cid:<b@c>\'>',
    (cid) => `/inline/${cid}`,
  );
  assert.doesNotMatch(doc, /http-equiv/);
  assert.match(doc, /src="\/inline\/logo@x"/);
  assert.match(doc, /src='\/inline\/b@c'/);
  assert.match(doc, /<base target="_blank">/);
  assert.match(doc, /no-referrer/);
});

test('referenced cids and remote content detection', () => {
  assert.deepEqual([...referencedCids('<img src="cid:A@b"> url(cid:x)')], ['a@b', 'x']);
  assert.equal(hasRemoteContent('<a href="https://x.example">link</a><p>hi</p>'), false);
  assert.equal(hasRemoteContent('<img src="https://t.example/p.gif">'), true);
  assert.equal(hasRemoteContent('<img src=//t.example/p.gif>'), true);
  assert.equal(hasRemoteContent('<td style="background:url(https://x/y.png)">'), true);
  assert.equal(hasRemoteContent('<link rel="stylesheet" href="https://x/s.css">'), true);
});

test('only safe types are previewed inline', () => {
  assert.equal(previewType('image/PNG', 'a.png')?.type, 'image/png');
  assert.equal(previewType('image/svg+xml', 'a.svg'), null);
  assert.equal(previewType('text/html', 'a.html'), null);
  assert.equal(previewType('application/octet-stream', 'scan.PDF')?.kind, 'pdf');
  assert.equal(previewType('application/octet-stream', 'page.html'), null);
  assert.equal(previewType('text/plain; charset=iso-8859-1', 'a.txt')?.type, 'text/plain; charset=utf-8');
});

test('attachment headers: downloads are octet-stream, previews are sandboxed', () => {
  const html = attachmentHeaders('text/html', 'evil.html', true);
  assert.equal(html['content-type'], 'application/octet-stream');
  assert.match(html['content-disposition'], /^attachment;/);
  const img = attachmentHeaders('image/jpeg', 'photo.jpg', true);
  assert.match(img['content-disposition'], /^inline;/);
  assert.match(img['content-security-policy'], /sandbox/);
  const dl = attachmentHeaders('image/jpeg', 'photo.jpg', false);
  assert.match(dl['content-disposition'], /^attachment;/);
});

test('content-disposition filenames cannot break the header', () => {
  const h = attachmentHeaders('application/zip', 'a"b\r\nSet-Cookie: x.zip', false);
  assert.doesNotMatch(h['content-disposition'], /[\r\n]/);
  assert.match(h['content-disposition'], /filename="a_b__Set-Cookie: x.zip"/);
  const u = attachmentHeaders('application/pdf', 'Résumé.pdf', false);
  assert.match(u['content-disposition'], /filename\*=UTF-8''R%C3%A9sum%C3%A9.pdf/);
});

test('return paths stay on this site', () => {
  assert.equal(safeReturnPath('/?q=x'), '/?q=x');
  assert.equal(safeReturnPath('//evil.example'), '/');
  assert.equal(safeReturnPath('/\\evil.example'), '/');
  assert.equal(safeReturnPath('https://evil.example'), '/');
  assert.equal(safeReturnPath(undefined), '/');
});

test('MAILVIEW_USERS parsing: provider user ids matched exactly, emails case-insensitively', () => {
  const u = parseUsers(' 3f2a1b4c-0000-4000-8000-000000000001=alice ; 109876543210987654321=family-member-1 ; Ab=Cd=x=bob ; Carol@Example.COM=carol ');
  assert.equal(u.bySub.get('3f2a1b4c-0000-4000-8000-000000000001'), 'alice');
  assert.equal(u.bySub.get('109876543210987654321'), 'family-member-1');
  assert.equal(u.bySub.get('Ab=Cd=x'), 'bob', 'the label is after the last "="');
  assert.equal(u.bySub.has('ab=cd=x'), false, 'ids are case-sensitive');
  assert.equal(u.byEmail.get('carol@example.com'), 'carol', 'emails are stored lowercased');
  assert.equal(u.bySub.has('Carol@Example.COM'), false, 'an email is never treated as an id');
  assert.deepEqual([...labels(u)].sort(), ['alice', 'bob', 'carol', 'family-member-1']);
  assert.throws(() => parseUsers('3f2a1b4c-0000-4000-8000-000000000001=Real Name'));
  assert.throws(() => parseUsers('=alice'));
  assert.throws(() => parseUsers('café=alice'), 'non-ASCII id');
  assert.throws(() => parseUsers(`${'x'.repeat(256)}=alice`), 'id longer than 255');
  assert.throws(() => parseUsers('carol@=carol'), 'not an email');
  assert.throws(() => parseUsers('a@b@c.com=carol'), 'not an email');
  assert.equal(keyVariable('family-member-1'), 'MAILVIEW_KEY_FAMILY_MEMBER_1');
});

test('sign-in matching: id first, then only a verified email', () => {
  const u = parseUsers('109876543210987654321=alice;carol@example.com=carol');
  assert.equal(labelOf(u, { sub: '109876543210987654321', email: null }), 'alice');
  assert.equal(labelOf(u, { sub: 'other', email: 'carol@example.com' }), 'carol');
  assert.equal(labelOf(u, { sub: 'other', email: null }), null);
  assert.equal(labelOf(u, { sub: 'other', email: 'mallory@example.com' }), null);
  assert.equal(verifiedEmail({ email: ' Carol@Example.com ', email_verified: true }), 'carol@example.com');
  assert.equal(verifiedEmail({ email: 'carol@example.com', email_verified: 'true' }), 'carol@example.com');
  assert.equal(verifiedEmail({ email: 'carol@example.com', email_verified: false }), null, 'unverified email never matches');
  assert.equal(verifiedEmail({ email: 'carol@example.com' }), null, 'missing email_verified counts as unverified');
  assert.equal(verifiedEmail({ email_verified: true }), null);
  assert.equal(verifiedEmail(undefined), null);
});

test('UI settings: defaults, choices checked', () => {
  const d = loadUiSettings({});
  assert.equal(d.appName, 'Mail archive');
  assert.equal(d.signInLabel, 'Sign in');
  assert.equal(d.signInIcon, 'none');
  assert.equal(d.remoteImages, 'ask', 'pictures from the internet are blocked unless the installation allows them');
  const s = loadUiSettings({ APP_NAME: ' Family mail ', SIGN_IN_ICON: 'Google', REMOTE_IMAGES: 'allow' });
  assert.equal(s.appName, 'Family mail');
  assert.equal(s.signInIcon, 'google');
  assert.equal(s.remoteImages, 'allow');
  assert.throws(() => loadUiSettings({ REMOTE_IMAGES: 'always' }));
  assert.throws(() => loadUiSettings({ SIGN_IN_ICON: 'github' }));
});

test('page settings: title escaped, data block cannot be closed, $ patterns stay literal', () => {
  const ui = { ...loadUiSettings({}), appName: 'A&B <x> $& $1', tagline: '</script><script>alert(1)</script>' };
  const html = withSettings('<html><head><title>Mail archive</title></head><body></body></html>', ui);
  assert.match(html, /<title>A&#38;B &#60;x&#62; \$&#38; \$1<\/title>/);
  assert.equal(html.match(/<\/script>/g)?.length, 1, 'only the data block\'s own closing tag');
  const block = html.match(/<script id="mv-settings" type="application\/json">(.*?)<\/script>/)?.[1] ?? '';
  assert.deepEqual(JSON.parse(block), ui);
});

test('each person gets only their own key; a person without a key is left out', () => {
  const env = {
    PUBLIC_URL: 'https://mail.example.com',
    OIDC_ISSUER: 'https://auth.example.com/realms/x',
    OIDC_CLIENT_ID: 'mailview',
    OIDC_CLIENT_SECRET: 's',
    MAILARCHIVER_API_URL: 'http://api',
    MAILVIEW_USERS: '3f2a1b4c-0000-4000-8000-000000000001=alice;member1@example.com=family-member-1',
    MAILVIEW_KEY_ALICE: 'ma_alice',
    MAILVIEW_KEY_FAMILY_MEMBER_1: 'change-me',
  };
  const cfg = loadConfig(env, []);
  assert.equal(cfg.demo, false);
  assert.equal(cfg.keys.get('alice'), 'ma_alice');
  assert.equal(cfg.keys.has('family-member-1'), false);
  assert.throws(() => loadConfig({ ...env, PUBLIC_URL: 'http://mail.example.com' }, []));
});

test('original message parsing: names and inline images only', async () => {
  const raw = [
    'From: "Alex Rivera" <alex@example.net>',
    'To: "Sam" <sam@example.com>, bob@example.org',
    'Subject: hi',
    'Content-Type: multipart/related; boundary="b"',
    '',
    '--b',
    'Content-Type: text/html',
    '',
    '<img src="cid:pic@x">',
    '--b',
    'Content-Type: image/png',
    'Content-ID: <Pic@X>',
    'Content-Transfer-Encoding: base64',
    '',
    'iVBORw0KGgo=',
    '--b',
    'Content-Type: text/html',
    'Content-ID: <page@x>',
    '',
    '<script>x</script>',
    '--b--',
    '',
  ].join('\r\n');
  const p = await parseOriginal(Buffer.from(raw));
  assert.deepEqual(p.from, { name: 'Alex Rivera', address: 'alex@example.net' });
  assert.equal(p.to.length, 2);
  assert.equal(p.inline.get('pic@x')?.contentType, 'image/png');
  assert.equal(p.inline.has('page@x'), false);
});
