import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, SignedOut, urls } from './api.ts';
import { avatarColor, displayName, fileSize, folderLabel, initial, longDate } from './format.ts';
import { BackIcon, ChevronIcon, CloseIcon, DownloadIcon, FileIcon, ImageIcon, OpenIcon, ShieldIcon } from './icons.tsx';
import type { Attachment, Message, Person } from './types.ts';
import { settings } from './settings.ts';

type Load = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; msg: Message };

export function Reader(props: {
  id: number | null;
  listIds: number[];
  onOpen: (id: number) => void;
  onClose: () => void;
  onSearch: (q: string) => void;
}) {
  const { id, listIds, onOpen, onClose, onSearch } = props;
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  useEffect(() => {
    if (id === null) return setLoad({ kind: 'idle' });
    const ctrl = new AbortController();
    setLoad({ kind: 'loading' });
    api.message(id, ctrl.signal).then(
      (msg) => setLoad({ kind: 'ok', msg }),
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof SignedOut) location.reload();
        setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => ctrl.abort();
  }, [id]);

  // j / k: next / previous message in the list; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && id !== null) onClose();
      if (e.key !== 'j' && e.key !== 'k') return;
      const i = id === null ? -1 : listIds.indexOf(id);
      const next = listIds[e.key === 'j' ? i + 1 : Math.max(0, i - 1)];
      if (next !== undefined) onOpen(next);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [id, listIds, onOpen, onClose]);

  return (
    <main className="reader" aria-label="Message">
      {load.kind === 'idle' && (
        <div className="reader-empty">
          <ShieldIcon size={40} />
          <p>Select a message to read it.</p>
          <p className="muted">Everything here is a read-only copy. Nothing you do here changes Gmail.</p>
        </div>
      )}
      {load.kind === 'loading' && <div className="reader-empty"><span className="spinner" /></div>}
      {load.kind === 'error' && (
        <div className="reader-empty">
          <p>{load.message === 'Not found' ? "This message isn't available." : load.message}</p>
          <button className="text-btn" onClick={onClose}>Back to the list</button>
        </div>
      )}
      {load.kind === 'ok' && <MessageView key={load.msg.id} msg={load.msg} onClose={onClose} onSearch={onSearch} />}
    </main>
  );
}

function MessageView({ msg, onClose, onSearch }: { msg: Message; onClose: () => void; onSearch: (q: string) => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const files = msg.attachments.filter((a) => !a.inline);
  const recipients = [...msg.to, ...msg.cc];

  return (
    <article className="message">
      <div className="message-bar">
        <button className="icon-btn back-btn" onClick={onClose} aria-label="Back to the list"><BackIcon /></button>
        <span className="folder-chip">{folderLabel(msg.folderName)}</span>
        <span className="spacer" />
        {msg.hasOriginal && (
          <a className="text-btn small" href={urls.original(msg.id)} title="Download the original message (.eml)">
            <DownloadIcon size={15} /> Original
          </a>
        )}
        <button className="icon-btn close-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
      </div>

      <h1 className="subject">{msg.subject || '(no subject)'}</h1>

      <div className="sender">
        <span className="avatar large" style={{ background: avatarColor(msg.from.address) }} aria-hidden="true">
          {initial(displayName(msg.from))}
        </span>
        <div className="sender-text">
          <div className="sender-line">
            <button className="link-btn sender-name" onClick={() => onSearch(`from:${msg.from.address}`)} title="Find all mail from this sender">
              {displayName(msg.from)}
            </button>
            {msg.from.name && <span className="muted address">&lt;{msg.from.address}&gt;</span>}
          </div>
          <button className="link-btn recipients" onClick={() => setShowDetails(!showDetails)} aria-expanded={showDetails}>
            to {recipients.length ? recipients.slice(0, 3).map(displayName).join(', ') : '(no recipient)'}
            {recipients.length > 3 && ` +${recipients.length - 3}`}
            <ChevronIcon size={14} />
          </button>
        </div>
        <time className="sent" dateTime={msg.sentDate}>{longDate(msg.sentDate)}</time>
      </div>

      {showDetails && (
        <dl className="details">
          <Row label="From" people={[msg.from]} />
          {msg.replyTo.length > 0 && <Row label="Reply-to" people={msg.replyTo} />}
          <Row label="To" people={msg.to} />
          {msg.cc.length > 0 && <Row label="Cc" people={msg.cc} />}
          {msg.bcc.length > 0 && <Row label="Bcc" people={msg.bcc} />}
          <dt>Date</dt><dd>{new Date(msg.sentDate).toLocaleString()}</dd>
        </dl>
      )}

      {files.length > 0 && (
        <section className="attachments" aria-label="Attachments">
          <h2>{files.length} {files.length === 1 ? 'attachment' : 'attachments'}</h2>
          <div className="att-grid">
            {files.map((a) => <AttachmentCard key={a.id} msgId={msg.id} a={a} onPreview={() => setLightbox(a)} />)}
          </div>
        </section>
      )}

      {msg.hasHtml ? <HtmlBody msg={msg} /> : <TextBody text={msg.text ?? ''} />}

      {lightbox && <Lightbox msgId={msg.id} a={lightbox} onClose={() => setLightbox(null)} />}
    </article>
  );
}

function Row({ label, people }: { label: string; people: Person[] }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{people.map((p, i) => (
        <span key={i} className="person">{p.name ? <>{p.name} <span className="muted">&lt;{p.address}&gt;</span></> : p.address}</span>
      ))}</dd>
    </>
  );
}

function AttachmentCard({ msgId, a, onPreview }: { msgId: number; a: Attachment; onPreview: () => void }) {
  const viewUrl = urls.attachment(msgId, a.id, true);
  const downloadUrl = urls.attachment(msgId, a.id, false);
  // No automatic thumbnails: Mail-Archiver logs every attachment fetch as a Download, so images load only when
  // someone clicks to preview them.
  const thumb: ReactNode = (
    <span className="att-icon">{a.preview === 'image' ? <ImageIcon size={22} /> : ext(a.fileName) || <FileIcon size={22} />}</span>
  );
  const open = a.preview === 'image'
    ? <button className="att-thumb" onClick={onPreview} title="Preview">{thumb}</button>
    : a.preview
      ? <a className="att-thumb" href={viewUrl} target="_blank" rel="noopener noreferrer" title="Open in a new tab">{thumb}</a>
      : <a className="att-thumb" href={downloadUrl} title="Download">{thumb}</a>;
  return (
    <div className="att">
      {open}
      <div className="att-meta">
        <span className="att-name" title={a.fileName}>{a.fileName || 'attachment'}</span>
        <span className="att-size">{fileSize(a.size)}</span>
      </div>
      <div className="att-actions">
        {a.preview === 'image' && <button className="icon-btn" onClick={onPreview} aria-label={`Preview ${a.fileName}`}><ImageIcon size={16} /></button>}
        {(a.preview === 'pdf' || a.preview === 'text') && (
          <a className="icon-btn" href={viewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.fileName}`}><OpenIcon size={16} /></a>
        )}
        <a className="icon-btn" href={downloadUrl} aria-label={`Download ${a.fileName}`}><DownloadIcon size={16} /></a>
      </div>
    </div>
  );
}

function ext(name: string): string {
  const m = /\.([a-z0-9]{1,4})$/i.exec(name);
  return m ? m[1].toUpperCase() : '';
}

function Lightbox({ msgId, a, onClose }: { msgId: number; a: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopImmediatePropagation(), onClose());
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-label={a.fileName} onClick={onClose}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span>{a.fileName}</span>
        <a className="icon-btn" href={urls.attachment(msgId, a.id, false)} aria-label="Download"><DownloadIcon /></a>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
      </div>
      <img src={urls.attachment(msgId, a.id, true)} alt={a.fileName} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/**
 * The email's own HTML, in a sandboxed iframe served with a strict CSP (no scripts). Pictures from the internet
 * follow REMOTE_IMAGES: "allow" loads them (senders' tracking pixels then see the archived email being opened, like
 * Gmail's default), "ask" blocks them until the reader clicks "Show pictures". The frame is same-origin so this page
 * can size it to its content.
 */
function HtmlBody({ msg }: { msg: Message }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const [images, setImages] = useState(settings.remoteImages === 'allow');
  const askForImages = !images && msg.hasRemoteContent;

  // Size the frame to the email. Re-measure when anything inside finishes loading (pictures arrive after the
  // document) and when the content changes size. An email styled to fill its frame (100vh + padding) would grow the
  // frame forever, so growth stops after a number of rounds.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    let doc: Document | null = null;
    let current = 0;
    let growths = 0;
    const measure = () => {
      if (!doc?.documentElement) return;
      const h = Math.max(120, doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
      if (h === current || (h > current && growths >= 40)) return;
      if (h > current) growths++;
      current = h;
      setHeight(h);
    };
    const onLoad = () => {
      doc = el.contentDocument;
      if (!doc) return;
      measure();
      doc.addEventListener('load', measure, true);
      ro = new ResizeObserver(measure);
      ro.observe(doc.documentElement);
      if (doc.body) ro.observe(doc.body);
    };
    el.addEventListener('load', onLoad);
    return () => {
      el.removeEventListener('load', onLoad);
      doc?.removeEventListener('load', measure, true);
      ro?.disconnect();
    };
  }, [msg.id]);

  return (
    <>
      {askForImages && (
        <div className="images-bar">
          <span>Pictures from the internet are hidden.</span>
          <button className="text-btn small" onClick={() => setImages(true)}>Show pictures</button>
        </div>
      )}
      <iframe
        ref={frame}
        className="body-frame"
        title="Message body"
        src={urls.body(msg.id, images)}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ height }}
      />
    </>
  );
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

function TextBody({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    parts.push(text.slice(last, m.index));
    parts.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]}</a>);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <div className="text-body">{text.trim() ? parts : <span className="muted">(This message has no text.)</span>}</div>;
}
