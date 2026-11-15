import { useEffect, useRef, useState } from 'react';
import { api, SignedOut } from './api.ts';
import { avatarColor, firstAddress, initial, shortDate } from './format.ts';
import { ChatIcon, ClipIcon, SortIcon } from './icons.tsx';
import type { Summary, View } from './types.ts';

interface ListState {
  key: string;
  items: Summary[];
  total: number;
  page: number;
  pages: number;
  loading: boolean;
  error: string | null;
}

export function MessageList(props: {
  view: View;
  selected: number | null;
  onOpen: (id: number) => void;
  onIds: (ids: number[]) => void;
  onSort: () => void;
}) {
  const { view, selected, onOpen, onIds, onSort } = props;
  const key = JSON.stringify({ ...view, id: null });
  const [state, setState] = useState<ListState>({ key, items: [], total: 0, page: 0, pages: 1, loading: true, error: null });
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const load = (page: number, signal?: AbortSignal) => {
    if (view.account === null) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.search(view, page, signal).then(
      (res) =>
        setState((s) => ({
          key,
          items: page === 1 ? res.items : [...s.items, ...res.items],
          total: res.totalItems,
          page,
          pages: res.totalPages,
          loading: false,
          error: null,
        })),
      (err: unknown) => {
        if (signal?.aborted) return;
        if (err instanceof SignedOut) location.reload();
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
      },
    );
  };

  // New search or filter: start over.
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ key, items: [], total: 0, page: 0, pages: 1, loading: true, error: null });
    scroller.current?.scrollTo({ top: 0 });
    load(1, ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => onIds(state.items.map((m) => m.id)), [state.items, onIds]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !state.loading && !state.error && state.page < state.pages) load(state.page + 1);
    }, { root: scroller.current, rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  });

  // Keep the open message visible when moving with j/k.
  useEffect(() => {
    if (selected === null) return;
    scroller.current?.querySelector(`[data-id="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const searching = Boolean(view.q || view.from || view.to);
  return (
    <section className="list" aria-label="Messages">
      <div className="list-head">
        <span className="list-count">
          {state.page === 0 && state.loading
            ? 'Loading…'
            : `${state.total.toLocaleString()} ${state.total === 1 ? 'message' : 'messages'}${searching ? ' found' : ''}`}
        </span>
        <button className="text-btn small" onClick={onSort} title="Change sort order">
          <SortIcon size={15} /> {view.sort === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>
      <div className="list-scroll" ref={scroller}>
        {state.items.map((m) => (
          <Row key={m.id} m={m} active={m.id === selected} onOpen={onOpen} />
        ))}
        {state.error && (
          <div className="list-note error">
            {state.error} <button className="text-btn" onClick={() => load(Math.max(1, state.page + (state.items.length ? 1 : 0)))}>Try again</button>
          </div>
        )}
        {!state.loading && !state.error && state.items.length === 0 && (
          <div className="list-note">{searching ? 'Nothing matches that search.' : 'No messages here.'}</div>
        )}
        {state.loading && <div className="list-note"><span className="spinner" /></div>}
        <div ref={sentinel} className="sentinel" />
      </div>
    </section>
  );
}

function Row({ m, active, onOpen }: { m: Summary; active: boolean; onOpen: (id: number) => void }) {
  const who = m.isOutgoing ? firstAddress(m.to) : m.from;
  const isChat = /chat/i.test(m.folderName);
  return (
    <button className={`row${active ? ' active' : ''}`} data-id={m.id} onClick={() => onOpen(m.id)}>
      <span className="avatar" style={{ background: avatarColor(who) }} aria-hidden="true">{initial(who)}</span>
      <span className="row-main">
        <span className="row-top">
          <span className="row-from">
            {m.isOutgoing && <span className="to-label">To: </span>}
            {who}
          </span>
          <time className="row-date" dateTime={m.sentDate}>{shortDate(m.sentDate)}</time>
        </span>
        <span className="row-subject">
          {isChat && <ChatIcon size={14} />}
          <span>{m.subject || '(no subject)'}</span>
          {m.hasAttachments && <span className="row-clip" title="Has attachments"><ClipIcon size={14} /></span>}
        </span>
      </span>
    </button>
  );
}
