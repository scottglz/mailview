// Reads what the API doesn't give us from the original message: display names and inline (cid:) images.
// Parsed results are cached briefly so a message with several inline images is fetched once.
import PostalMime from 'postal-mime';
import type { Address } from 'postal-mime';
import { normalizeCid } from './html.ts';
import { previewType } from './files.ts';

export interface Person {
  name: string;
  address: string;
}

export interface InlinePart {
  contentType: string;
  fileName: string | null;
  bytes: Uint8Array;
}

export interface ParsedOriginal {
  from: Person | null;
  to: Person[];
  cc: Person[];
  replyTo: Person[];
  /** Inline images by normalized Content-ID. Only images, max 10 MB each. */
  inline: Map<string, InlinePart>;
}

function people(list: Address[] | Address | undefined): Person[] {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  return arr.flatMap((a) => (a.group ? a.group : [a])).map((m) => ({ name: m.name ?? '', address: m.address ?? '' }));
}

const MAX_INLINE = 10 * 1024 * 1024;

export async function parseOriginal(bytes: Uint8Array): Promise<ParsedOriginal> {
  const email = await PostalMime.parse(bytes, { attachmentEncoding: 'arraybuffer' });
  const inline = new Map<string, InlinePart>();
  for (const a of email.attachments) {
    if (!a.contentId || typeof a.content === 'string') continue;
    const preview = previewType(a.mimeType, a.filename ?? '');
    if (preview?.kind !== 'image' || a.content.byteLength > MAX_INLINE) continue;
    const content = a.content instanceof Uint8Array ? a.content : new Uint8Array(a.content);
    inline.set(normalizeCid(a.contentId), { contentType: preview.type, fileName: a.filename, bytes: content });
  }
  return {
    from: people(email.from)[0] ?? null,
    to: people(email.to),
    cc: people(email.cc),
    replyTo: people(email.replyTo),
    inline,
  };
}
