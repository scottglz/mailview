// Email HTML is untrusted (2,000+ archived bodies contain <script>). It's never put into the app's own page:
// it's served as its own document with a strict Content-Security-Policy and shown in a sandboxed iframe.
//  - no scripts (CSP `sandbox` without allow-scripts, plus `default-src 'none'`), no forms, no frames
//  - remote images, fonts and stylesheets blocked unless the reader clicks "Show images" (tracking pixels)
//  - links open in a new tab without a referrer
//  - cid: references point at this app's inline-image endpoint

const REMOTE_REF = /(?:src|background|href)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\//i;
const LINK_TAG = /<link\b[^>]*rel\s*=\s*["']?stylesheet/i;

/** Whether the HTML references anything remote that the default policy blocks (for the "Show images" bar). */
export function hasRemoteContent(html: string): boolean {
  const withoutAnchors = html.replace(/<a\b[^>]*>/gi, '');
  return REMOTE_REF.test(withoutAnchors) || LINK_TAG.test(html);
}

// cid:part@id (RFC 2392); some senders wrap the id in angle brackets.
const CID_REF = /cid:<?([^"'()\s<>]+)>?/gi;

/** cid: values referenced from the HTML, without angle brackets, lower-cased. */
export function referencedCids(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(CID_REF)) out.add(normalizeCid(m[1]));
  return out;
}

export function normalizeCid(cid: string): string {
  let v = cid.trim().replace(/^<|>$/g, '');
  try {
    v = decodeURIComponent(v);
  } catch {
    // keep as is
  }
  return v.toLowerCase();
}

export function bodyCsp(allowRemote: boolean): string {
  const remote = allowRemote ? ' https: http:' : '';
  return [
    "default-src 'none'",
    `img-src 'self' data:${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${remote}`,
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
    'sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox',
  ].join('; ');
}

const BASE_STYLE = `
:root { color-scheme: light; }
html, body { margin: 0; padding: 0; background: #fff; }
/* The frame is sized to the content, so an email's own height: 100% must not pin the page to the frame. */
html, body { height: auto !important; min-height: 0 !important; }
body { padding: 20px 24px; color: #1f2328; font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow-wrap: break-word; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; }
blockquote[type=cite] { margin: 0 0 0 .8ex; padding-left: 1ex; border-left: 2px solid #d0d7de; color: #57606a; }
`;

export function emailDocument(html: string, cidUrl: (cid: string) => string): string {
  const body = html
    // Meta refresh can navigate the frame; the CSP doesn't stop navigations.
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
    .replace(CID_REF, (_m, cid: string) => cidUrl(normalizeCid(cid)));
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer"><base target="_blank">' +
    `<style>${BASE_STYLE}</style></head><body>${body}</body></html>`
  );
}
