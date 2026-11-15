import type { Person, View } from './types.ts';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** List dates: time today, "Nov 3" this year, "Mar 4, 2019" before. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function relative(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 90) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} h ago`;
  return shortDate(iso);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function displayName(p: Person): string {
  return p.name || p.address;
}

/** First address of a comma-separated list, plus "+n". */
export function firstAddress(list: string): string {
  const parts = list.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return '(no recipient)';
  return parts.length > 1 ? `${parts[0]} +${parts.length - 1}` : parts[0];
}

export function folderLabel(path: string): string {
  return path.replace(/^\[Gmail\]\//, '');
}

const PALETTE = ['#2f5d8a', '#8a4f2f', '#2f7a5d', '#6b3f8a', '#8a2f4f', '#4f6b2f', '#2f6f8a', '#7a5d2f'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initial(nameOrAddress: string): string {
  const m = /[\p{L}\p{N}]/u.exec(nameOrAddress);
  return m ? m[0].toUpperCase() : '?';
}

// ---- address bar <-> view ------------------------------------------------------------------------------------------

export function viewFromUrl(): View {
  const p = new URLSearchParams(location.search);
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const dir = p.get('direction');
  return {
    account: num(p.get('account')),
    q: p.get('q') ?? '',
    folder: p.get('folder') ?? '',
    direction: dir === 'incoming' || dir === 'outgoing' ? dir : '',
    from: date(p.get('from')),
    to: date(p.get('to')),
    sort: p.get('sort') === 'asc' ? 'asc' : 'desc',
    id: num(p.get('id')),
  };
}

export function viewToUrl(v: View): string {
  const p = new URLSearchParams();
  if (v.account !== null) p.set('account', String(v.account));
  if (v.q) p.set('q', v.q);
  if (v.folder) p.set('folder', v.folder);
  if (v.direction) p.set('direction', v.direction);
  if (v.from) p.set('from', v.from);
  if (v.to) p.set('to', v.to);
  if (v.sort === 'asc') p.set('sort', 'asc');
  if (v.id !== null) p.set('id', String(v.id));
  const s = p.toString();
  return s ? `/?${s}` : '/';
}
