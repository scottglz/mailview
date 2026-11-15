import { relative } from './format.ts';
import { InboxIcon, ReceivedIcon, SentIcon } from './icons.tsx';
import type { Account, View } from './types.ts';

export function Sidebar(props: { accounts: Account[]; account: Account; view: View; onChange: (v: View) => void }) {
  const { accounts, account, view, onChange } = props;

  const base: View = { ...view, folder: '', direction: '' };
  const nav = (label: string, icon: React.ReactNode, next: View, active: boolean) => (
    <button key={label} className={`nav-item${active ? ' active' : ''}`} onClick={() => onChange(next)}>
      {icon}
      <span className="nav-label">{label}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      {accounts.length > 1 ? (
        <label className="account-picker">
          <span className="sr-only">Mailbox</span>
          <select value={account.id} onChange={(e) => onChange({ ...view, account: Number(e.target.value), folder: '', direction: '' })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      ) : (
        <div className="account-name" title={account.emailAddress}>{account.name}</div>
      )}
      <div className="account-sync">
        {account.isEnabled ? `Synced ${relative(account.lastSync)}` : 'Not syncing (archive only)'}
      </div>

      <nav className="nav">
        {nav('All mail', <InboxIcon />, base, !view.folder && !view.direction)}
        {nav('Received', <ReceivedIcon />, { ...base, direction: 'incoming' }, view.direction === 'incoming')}
        {nav('Sent', <SentIcon />, { ...base, direction: 'outgoing' }, view.direction === 'outgoing')}
      </nav>

      <div className="nav-heading">Dates</div>
      <div className="dates">
        <label>From<input type="date" value={view.from} max={view.to || undefined} onChange={(e) => onChange({ ...view, from: e.target.value })} /></label>
        <label>To<input type="date" value={view.to} min={view.from || undefined} onChange={(e) => onChange({ ...view, to: e.target.value })} /></label>
        {(view.from || view.to) && (
          <button className="text-btn small" onClick={() => onChange({ ...view, from: '', to: '' })}>Clear dates</button>
        )}
      </div>

      <details className="tips">
        <summary>Search tips</summary>
        <ul>
          <li><code>from:alex</code> sender</li>
          <li><code>to:jordan</code> recipient</li>
          <li><code>subject:receipt</code> subject only</li>
          <li><code>body:tickets</code> message text only</li>
          <li><code>"exact phrase"</code></li>
          <li>Words match their beginnings: <code>recei</code> finds receipt</li>
          <li>Press <kbd>/</kbd> to search</li>
        </ul>
      </details>
    </aside>
  );
}
