// Which attachments the browser may show inline, and the headers for serving them. Anything not on the list is
// downloaded as application/octet-stream, so an attached .html or .svg can never run in this site's origin.

export type PreviewKind = 'image' | 'pdf' | 'text';

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
  'image/bmp': 'image/bmp',
  'image/avif': 'image/avif',
};
const IMAGE_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
};
const TEXT_TYPES = new Set(['text/plain', 'text/csv', 'text/calendar', 'text/x-vcard', 'text/vcard', 'application/ics']);
const TEXT_EXT = new Set(['txt', 'csv', 'ics', 'vcf', 'log', 'md']);

function ext(fileName: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(fileName);
  return m ? m[1].toLowerCase() : '';
}

/** The safe type to serve inline as, or null if the file must be downloaded. */
export function previewType(contentType: string, fileName: string): { kind: PreviewKind; type: string } | null {
  const ct = contentType.split(';')[0].trim().toLowerCase();
  const generic = ct === '' || ct === 'application/octet-stream';
  const e = ext(fileName);
  if (IMAGE_TYPES[ct]) return { kind: 'image', type: IMAGE_TYPES[ct] };
  if (ct === 'application/pdf' || (generic && e === 'pdf')) return { kind: 'pdf', type: 'application/pdf' };
  if (TEXT_TYPES.has(ct) || (generic && TEXT_EXT.has(e))) return { kind: 'text', type: 'text/plain; charset=utf-8' };
  if (generic && IMAGE_EXT[e]) return { kind: 'image', type: IMAGE_EXT[e] };
  return null;
}

export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const clean = fileName.replace(/[\r\n"\\]/g, '_') || 'attachment';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/** Response headers for an attachment: inline only for previewable types, otherwise a plain download. */
export function attachmentHeaders(contentType: string, fileName: string, inline: boolean): Record<string, string> {
  const preview = inline ? previewType(contentType, fileName) : null;
  const common = { 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' };
  if (!preview) {
    return {
      ...common,
      'content-type': 'application/octet-stream',
      'content-disposition': contentDisposition('attachment', fileName),
      'content-security-policy': "default-src 'none'; sandbox",
    };
  }
  // Chrome's PDF viewer refuses to run in a sandboxed document, so PDFs get no `sandbox`. PDFs can't run script
  // in this origin either way.
  const csp =
    preview.kind === 'pdf'
      ? "default-src 'none'; frame-ancestors 'self'"
      : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox";
  return {
    ...common,
    'content-type': preview.type,
    'content-disposition': contentDisposition('inline', fileName),
    'content-security-policy': csp,
  };
}
