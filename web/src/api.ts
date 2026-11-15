import type { Account, Folder, Message, Page, View } from './types.ts';

export class SignedOut extends Error {}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, credentials: 'same-origin' });
  if (res.status === 401) throw new SignedOut();
  if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : `The archive didn't answer (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

export const api = {
  me: () => get<{ accounts: Account[]; demo: boolean }>('/api/me'),
  folders: (account: number) => get<Folder[]>(`/api/accounts/${account}/folders`),
  search(view: View, page: number, signal?: AbortSignal) {
    const qs = new URLSearchParams({ account: String(view.account), page: String(page), sort: view.sort });
    if (view.q) qs.set('q', view.q);
    if (view.folder) qs.set('folder', view.folder);
    if (view.direction) qs.set('direction', view.direction);
    if (view.from) qs.set('from', view.from);
    if (view.to) qs.set('to', view.to);
    return get<Page>(`/api/messages?${qs}`, signal);
  },
  message: (id: number, signal?: AbortSignal) => get<Message>(`/api/messages/${id}`, signal),
};

export const urls = {
  body: (id: number, images: boolean) => `/api/messages/${id}/body${images ? '?images=1' : ''}`,
  attachment: (msg: number, att: number, view: boolean) =>
    `/api/messages/${msg}/attachments/${att}${view ? '?view=1' : ''}`,
  original: (id: number) => `/api/messages/${id}/original`,
  signIn: () => `/auth/login?return=${encodeURIComponent(location.pathname + location.search)}`,
};
