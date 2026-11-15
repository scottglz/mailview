import { useCallback, useEffect, useRef, useState } from 'react';
import { api, SignedOut } from './api.ts';
import { viewFromUrl, viewToUrl } from './format.ts';
import { MenuIcon, MoonIcon, SearchIcon, CloseIcon, SunIcon } from './icons.tsx';
import { MessageList } from './MessageList.tsx';
import { Reader } from './Reader.tsx';
import { settings } from './settings.ts';
import { Sidebar } from './Sidebar.tsx';
import { SignIn } from './SignIn.tsx';
import { useTheme } from './theme.ts';
import type { Account, View } from './types.ts';

function ThemeButton() {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button className="icon-btn theme-btn" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; accounts: Account[]; demo: boolean };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [view, setViewState] = useState<View>(viewFromUrl);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listIds, setListIds] = useState<number[]>([]);

  useEffect(() => {
    api
      .me()
      .then((me) => setState({ kind: 'ready', accounts: me.accounts, demo: me.demo }))
      .catch((err: unknown) =>
        setState(err instanceof SignedOut ? { kind: 'signed-out' } : { kind: 'error', message: String(err) }),
      );
  }, []);

  useEffect(() => {
    const onPop = () => setViewState(viewFromUrl());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const setView = useCallback((next: View, replace = false) => {
    setViewState(next);
    const url = viewToUrl(next);
    if (url !== location.pathname + location.search) {
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
    }
  }, []);

  // Default to the first mailbox.
  useEffect(() => {
    if (state.kind !== 'ready' || state.accounts.length === 0) return;
    if (view.account === null || !state.accounts.some((a) => a.id === view.account)) {
      setView({ ...view, account: state.accounts[0].id, id: null }, true);
    }
  }, [state, view, setView]);

  if (state.kind === 'loading') return <div className="splash" aria-busy="true" />;
  if (state.kind === 'signed-out') return <SignIn />;
  if (state.kind === 'error') return <SignIn error={state.message} />;
  if (state.accounts.length === 0) return <SignIn error="No mailbox is set up for your account yet." />;

  const account = state.accounts.find((a) => a.id === view.account) ?? state.accounts[0];
  const openMessage = (id: number | null) => setView({ ...view, id });

  return (
    <div className={`app${view.id !== null ? ' has-reader' : ''}${menuOpen ? ' menu-open' : ''}`}>
      <header className="topbar">
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <MenuIcon />
        </button>
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); setView({ ...view, q: '', folder: '', direction: '', from: '', to: '', id: null }); }}>
          <img src="/favicon.svg" alt="" width="26" height="26" />
          <span>{settings.appName}</span>
        </a>
        <SearchBox value={view.q} onSearch={(q) => setView({ ...view, q, id: null })} />
        {state.demo && <span className="demo-badge" title="Made-up messages for trying out the design">Demo</span>}
        <ThemeButton />
        <form method="post" action="/auth/logout" className="signout">
          <button className="text-btn" type="submit">Sign out</button>
        </form>
      </header>
      <Sidebar
        accounts={state.accounts}
        account={account}
        view={view}
        onChange={(v) => { setMenuOpen(false); setView({ ...v, id: null }); }}
      />
      <div className="scrim" onClick={() => setMenuOpen(false)} />
      <MessageList view={view} selected={view.id} onOpen={openMessage} onIds={setListIds}
        onSort={() => setView({ ...view, sort: view.sort === 'desc' ? 'asc' : 'desc', id: null })} />
      <Reader id={view.id} onClose={() => openMessage(null)} listIds={listIds} onOpen={openMessage}
        onSearch={(q) => setView({ ...view, q, id: null })} />
    </div>
  );
}

function SearchBox({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(text.trim()); input.current?.blur(); }}>
      <SearchIcon />
      <input
        ref={input}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search mail"
        aria-label="Search mail"
        enterKeyHint="search"
      />
      {text && (
        <button type="button" className="icon-btn clear" aria-label="Clear search" onClick={() => { setText(''); onSearch(''); }}>
          <CloseIcon size={16} />
        </button>
      )}
    </form>
  );
}
