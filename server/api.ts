// Client for Mail-Archiver's read-only REST API (/api/v1, Mail-Archiver 2611.x, doc/API.md upstream).
// Meant to be reached over an internal network; the reverse proxy should block Mail-Archiver's /api from outside.
import type { Account, Backend, Detail, Folder, Paged, SearchParams, Summary } from './backend.ts';

export class UpstreamError extends Error {
  readonly status: number;
  constructor(status: number, what: string) {
    // Never include query strings: they can contain search terms.
    super(`Mail-Archiver API ${what} failed with HTTP ${status}`);
    this.status = status;
  }
}

// The API returns .NET DateTimes stored as UTC without an offset. Make that explicit.
function utc(value: string | null | undefined): string | null {
  if (!value) return null;
  return /(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
}

function fixSummary<T extends Summary>(s: T): T {
  return { ...s, sentDate: utc(s.sentDate) ?? s.sentDate };
}

export function apiBackend(baseUrl: string, apiKey: string): Backend {
  const base = baseUrl.replace(/\/$/, '');

  async function get(path: string, what: string): Promise<Response | null> {
    const res = await fetch(base + path, {
      headers: { authorization: `Bearer ${apiKey}`, accept: '*/*' },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new UpstreamError(res.status, what);
    }
    return res;
  }

  async function json<T>(path: string, what: string): Promise<T | null> {
    const res = await get(path, what);
    return res ? ((await res.json()) as T) : null;
  }

  async function bytes(path: string, what: string): Promise<Uint8Array | null> {
    const res = await get(path, what);
    return res ? new Uint8Array(await res.arrayBuffer()) : null;
  }

  return {
    async accounts() {
      const list = (await json<Account[]>('/accounts', 'accounts')) ?? [];
      return list.map((a) => ({ ...a, lastSync: utc(a.lastSync) }));
    },

    async folders(accountId) {
      return (await json<Folder[]>(`/accounts/${accountId}/folders`, 'folders')) ?? [];
    },

    async search(p: SearchParams) {
      const qs = new URLSearchParams({
        accountId: String(p.accountId),
        page: String(p.page),
        pageSize: String(p.pageSize),
        sortBy: 'sentDate',
        sortOrder: p.sortOrder ?? 'desc',
      });
      if (p.q) qs.set('q', p.q);
      if (p.folder) qs.set('folder', p.folder);
      if (p.direction) qs.set('direction', p.direction);
      if (p.from) qs.set('from', p.from);
      if (p.to) qs.set('to', p.to);
      const page = await json<Paged<Summary>>(`/emails?${qs}`, 'search');
      if (!page) throw new UpstreamError(404, 'search');
      return { ...page, items: page.items.map(fixSummary) };
    },

    async message(id) {
      const d = await json<Detail>(`/emails/${id}`, 'message');
      return d ? { ...fixSummary(d), receivedDate: utc(d.receivedDate) ?? d.receivedDate } : null;
    },

    attachment(emailId, attachmentId) {
      return bytes(`/emails/${emailId}/attachments/${attachmentId}`, 'attachment');
    },

    async original(id) {
      return (await bytes(`/emails/${id}/raw`, 'raw')) ?? (await bytes(`/emails/${id}/eml`, 'eml'));
    },
  };
}
