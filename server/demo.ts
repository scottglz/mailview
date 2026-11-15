// A made-up mailbox for working on the UI without real mail (MAILVIEW_DEMO=1: no sign-in, no Mail-Archiver).
// Every name, address and message here is invented.
import { deflateSync, crc32 } from 'node:zlib';
import type { Account, AttachmentMeta, Backend, Detail, Folder, SearchParams, Summary } from './backend.ts';

// ---- tiny binary fixtures ----------------------------------------------------------------------------------------

function png(width: number, height: number, color: (x: number, y: number) => [number, number, number]): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y);
      raw.set([r, g, b], y * (width * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pdf(lines: string[]): Uint8Array {
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 72 ${720 - i * 28} Td (${l.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const PHOTO = png(480, 300, (x, y) => [40 + Math.round((x / 480) * 120), 110 + Math.round((y / 300) * 90), 190]);
const LOGO = png(120, 40, (x) => (x < 40 ? [233, 116, 81] : [38, 70, 83]));
const INVOICE = pdf(['Northwind Travel', 'Booking confirmation NW-48213', 'Two travellers, 3 nights', 'Total: $1,284.00']);
const NOTES = Buffer.from('Packing list\n- passports\n- chargers\n- the good umbrella\n', 'utf8');
const DOCX = Buffer.from('PK\u0003\u0004 demo placeholder, not a real document', 'latin1');

// ---- messages -----------------------------------------------------------------------------------------------------

interface DemoAttachment extends AttachmentMeta {
  bytes: Uint8Array;
  cid?: string;
}
interface DemoMessage extends Detail {
  fromName: string;
  toNames: string[];
  demoAttachments: DemoAttachment[];
}

const ME = { name: 'Sam Example', address: 'sam.example@example.com' };
const PEOPLE = [
  { name: 'Alex Rivera', address: 'alex.rivera@example.net' },
  { name: 'Jordan Lee', address: 'jordan@example.org' },
  { name: 'Priya Natarajan', address: 'priya.n@example.com' },
  { name: 'Grandma', address: 'grandma.example@example.net' },
];
const COMPANIES = [
  { name: 'Northwind Travel', address: 'bookings@northwind.example' },
  // Long address without spaces (real senders do this): must not widen the list
  { name: 'Coffee Talk', address: 'donotreply+cbb753d8-8ff3-54f8-9c64-fddece0b9c8d@notifications.example' },
  { name: 'Riverbend Library', address: 'notices@riverbend-library.example' },
  { name: 'Contoso Bank', address: 'alerts@contoso-bank.example' },
  { name: 'Fabrikam Outdoor', address: 'news@fabrikam.example' },
  { name: 'City Utilities', address: 'billing@city-utilities.example' },
];

let seed = 7;
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function newsletter(company: string, remote: boolean): string {
  const img = remote
    ? '<img src="https://images.example.com/banner.jpg" width="560" height="180" alt="Autumn sale banner" style="display:block;width:100%">'
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:24px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#264653;color:#fff;padding:20px 28px;font:600 20px Georgia,serif">${company}</td></tr>
<tr><td>${img}</td></tr>
<tr><td style="padding:24px 28px;font:15px/1.6 Arial,sans-serif;color:#333">
<h2 style="margin:0 0 12px;font:600 22px Georgia,serif">This month at ${company}</h2>
<p>Thanks for being with us. Here's what's new this month, plus a few things we think you'll like.</p>
<p><a href="https://www.example.com/offers" style="display:inline-block;background:#e76f51;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">See the offers</a></p>
<p style="color:#888;font-size:12px">You are receiving this because you signed up at example.com. <a href="https://www.example.com/unsubscribe">Unsubscribe</a></p>
<script>alert('emails can contain scripts; this one must never run')</script>
</td></tr></table></td></tr></table>`;
}

function receipt(company: string, amount: string): string {
  // height: 100% on html/body plus a picture without a size, like many real newsletters: the email only reaches its
  // full height after the picture has loaded (the frame must still grow to fit).
  return `<style>html, body { height: 100%; }</style><div style="font:14px/1.5 Arial,sans-serif;max-width:520px">
<img src="cid:logo@demo" alt="${company}" width="120" height="40">
<h2 style="font-weight:600">Your receipt</h2>
<img src="cid:photo@demo" alt="Thanks for being a customer">
<p>Thanks for being with us for another year.</p>
<table cellpadding="6" style="border-collapse:collapse;width:100%">
<tr style="border-bottom:1px solid #ddd"><td>Monthly service</td><td align="right">${amount}</td></tr>
<tr style="border-bottom:1px solid #ddd"><td>Tax</td><td align="right">$0.00</td></tr>
<tr><td><b>Total</b></td><td align="right"><b>${amount}</b></td></tr></table>
<p style="color:#666">Questions? Reply to this email.</p></div>`;
}

const PERSONAL_TEXT = [
  'Hi!\n\nAre we still on for Saturday? I can bring the folding chairs and the big cooler.\n\nSee you then,\nA.',
  'Here are the photos from the lake. The one with the heron came out really well.\n\nLove,\nGrandma',
  "Quick reminder: the school fundraiser forms are due Friday. I've filled in ours already.\n\n> On Tue, you wrote:\n> Do you have the form?",
  'Thanks for dinner last night, it was lovely. Next time is on us.\n\nJordan',
];

function build(): DemoMessage[] {
  const out: DemoMessage[] = [];
  let attId = 1;
  const now = Date.UTC(2026, 10, 12, 18, 0, 0);
  for (let i = 0; i < 260; i++) {
    const id = 1000 + i;
    const accountId = i % 7 === 6 ? 2 : 1;
    const sent = new Date(now - Math.floor(i * 1.6 * 86_400_000 + rnd() * 50_000_000));
    const kind = i === 0 ? 'receipt' : i === 1 ? 'personal-att' : pick(['news', 'news', 'receipt', 'personal', 'personal', 'outgoing', 'chat']);
    const company = pick(COMPANIES);
    const person = pick(PEOPLE);
    let from = person;
    let to = [ME];
    let subject = '';
    let html: string | null = null;
    let text: string | null = null;
    let folder = '[Gmail]/All Mail';
    let outgoing = false;
    const atts: DemoAttachment[] = [];
    switch (kind) {
      case 'news':
        from = company;
        subject = pick(['Autumn offers inside', 'Your monthly update', 'New arrivals this week', 'Last chance: member pricing']);
        html = newsletter(company.name, rnd() > 0.3);
        text = 'This month at ' + company.name;
        break;
      case 'receipt': {
        from = company;
        const amount = `$${(20 + Math.floor(rnd() * 180)).toFixed(2)}`;
        subject = `Receipt for your payment of ${amount}`;
        html = receipt(company.name, amount);
        atts.push({ id: attId++, fileName: 'logo.png', contentType: 'image/png', size: LOGO.length, bytes: LOGO, cid: 'logo@demo' });
        atts.push({ id: attId++, fileName: 'thanks.png', contentType: 'image/png', size: PHOTO.length, bytes: PHOTO, cid: 'photo@demo' });
        if (i % 3 === 0) atts.push({ id: attId++, fileName: 'booking-NW-48213.pdf', contentType: 'application/pdf', size: INVOICE.length, bytes: INVOICE });
        break;
      }
      case 'personal-att':
      case 'personal':
        subject = pick(['Saturday?', 'Photos from the lake', 'Fundraiser forms', 'Thank you!', 'Re: holiday plans']);
        text = pick(PERSONAL_TEXT);
        if (kind === 'personal-att' || rnd() > 0.75) {
          atts.push({ id: attId++, fileName: 'lake.png', contentType: 'image/png', size: PHOTO.length, bytes: PHOTO });
          atts.push({ id: attId++, fileName: 'packing list.txt', contentType: 'text/plain', size: NOTES.length, bytes: NOTES });
          atts.push({ id: attId++, fileName: 'Itinerary draft.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: DOCX.length, bytes: DOCX });
        }
        break;
      case 'outgoing':
        from = ME;
        to = [person, ...(rnd() > 0.6 ? [pick(PEOPLE)] : [])];
        outgoing = true;
        subject = pick(['Re: Saturday?', 'Directions', 'Re: Photos from the lake', 'Recipe you asked for']);
        text = "Sounds good to me. I'll call you on the way.\n\nSam";
        break;
      case 'chat':
        folder = 'Chats';
        subject = `Chat with ${person.name}`;
        html = `<div><b>${person.name}</b>: running 10 minutes late<br><b>me</b>: no problem, grabbing a table</div>`;
        text = `${person.name}: running 10 minutes late\nme: no problem, grabbing a table`;
        break;
    }
    out.push({
      id,
      accountId,
      subject,
      from: from.address,
      fromName: from.name,
      to: to.map((t) => t.address).join(','),
      toNames: to.map((t) => t.name),
      cc: '',
      bcc: '',
      sentDate: sent.toISOString(),
      receivedDate: sent.toISOString(),
      isOutgoing: outgoing,
      hasAttachments: atts.length > 0,
      folderName: folder,
      messageId: `<${id}@demo.example>`,
      textBody: text,
      htmlBody: html,
      attachments: atts.map(({ bytes: _b, cid: _c, ...meta }) => meta),
      demoAttachments: atts,
      hasRawMessage: true,
    });
  }
  return out;
}

const MESSAGES = build();

function summary(m: DemoMessage): Summary {
  const { id, accountId, subject, from, to, sentDate, isOutgoing, hasAttachments, folderName } = m;
  return { id, accountId, subject, from, to, sentDate, isOutgoing, hasAttachments, folderName };
}

function matches(m: DemoMessage, q: string): boolean {
  const haystack = (field: string) => {
    switch (field) {
      case 'from': return `${m.from} ${m.fromName}`;
      case 'to': return `${m.to} ${m.toNames.join(' ')}`;
      case 'subject': return m.subject;
      default: return `${m.subject} ${m.from} ${m.fromName} ${m.to} ${m.textBody ?? ''} ${m.htmlBody ?? ''}`;
    }
  };
  const terms = q.match(/(\w+:)?("[^"]*"|\S+)/g) ?? [];
  return terms.every((t) => {
    const m2 = /^(\w+):(.*)$/.exec(t);
    const field = m2 && ['from', 'to', 'subject'].includes(m2[1]) ? m2[1] : '';
    const value = (field ? m2![2] : t).replace(/"/g, '').toLowerCase();
    return haystack(field).toLowerCase().includes(value);
  });
}

function mime(m: DemoMessage): string {
  const fmt = (name: string, addr: string) => `"${name}" <${addr}>`;
  const toNames = m.to.split(',').map((a, i) => fmt(m.toNames[i] ?? '', a)).join(', ');
  const headers = `From: ${fmt(m.fromName, m.from)}\r\nTo: ${toNames}\r\nSubject: ${m.subject}\r\nDate: ${new Date(m.sentDate).toUTCString()}\r\nMIME-Version: 1.0\r\n`;
  const inline = m.demoAttachments.filter((a) => a.cid);
  const body = m.htmlBody ?? m.textBody ?? '';
  const bodyType = m.htmlBody ? 'text/html' : 'text/plain';
  if (inline.length === 0) return `${headers}Content-Type: ${bodyType}; charset=utf-8\r\n\r\n${body}`;
  const b = 'demo-boundary';
  let out = `${headers}Content-Type: multipart/related; boundary="${b}"\r\n\r\n--${b}\r\nContent-Type: ${bodyType}; charset=utf-8\r\n\r\n${body}\r\n`;
  for (const a of inline) {
    const data = Buffer.from(a.bytes).toString('base64').replace(/.{76}/g, '$&\r\n');
    out += `--${b}\r\nContent-Type: ${a.contentType}; name="${a.fileName}"\r\nContent-ID: <${a.cid}>\r\nContent-Disposition: inline; filename="${a.fileName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${data}\r\n`;
  }
  return `${out}--${b}--\r\n`;
}

export function demoBackend(): Backend {
  const accounts: Account[] = [
    { id: 1, name: 'Personal (demo)', emailAddress: ME.address, isEnabled: true, lastSync: new Date(Date.now() - 1_800_000).toISOString() },
    { id: 2, name: 'Old school account (demo)', emailAddress: 'sam.old@example.edu', isEnabled: false, lastSync: '2026-01-04T10:00:00Z' },
  ];
  return {
    async accounts() {
      return accounts;
    },
    async folders(accountId) {
      const inAcc = MESSAGES.filter((m) => m.accountId === accountId);
      const folders: Folder[] = [...new Set(inAcc.map((m) => m.folderName))].map((f) => ({
        name: f.split('/').pop()!,
        fullPath: f,
        totalCount: inAcc.filter((m) => m.folderName === f).length,
        children: [],
      }));
      return folders;
    },
    async search(p: SearchParams) {
      let list = MESSAGES.filter((m) => m.accountId === p.accountId);
      if (p.folder) list = list.filter((m) => m.folderName === p.folder);
      if (p.direction) list = list.filter((m) => m.isOutgoing === (p.direction === 'outgoing'));
      if (p.from) list = list.filter((m) => m.sentDate.slice(0, 10) >= p.from!);
      if (p.to) list = list.filter((m) => m.sentDate.slice(0, 10) <= p.to!);
      if (p.q) list = list.filter((m) => matches(m, p.q!));
      if (p.sortOrder === 'asc') list = [...list].reverse();
      const start = (p.page - 1) * p.pageSize;
      await new Promise((r) => setTimeout(r, 120));
      return {
        items: list.slice(start, start + p.pageSize).map(summary),
        page: p.page,
        pageSize: p.pageSize,
        totalItems: list.length,
        totalPages: Math.ceil(list.length / p.pageSize),
      };
    },
    async message(id) {
      const m = MESSAGES.find((x) => x.id === id);
      if (!m) return null;
      const { fromName: _f, toNames: _t, demoAttachments: _d, ...detail } = m;
      return detail;
    },
    async attachment(emailId, attachmentId) {
      return MESSAGES.find((x) => x.id === emailId)?.demoAttachments.find((a) => a.id === attachmentId)?.bytes ?? null;
    },
    async original(id) {
      const m = MESSAGES.find((x) => x.id === id);
      return m ? Buffer.from(mime(m), 'utf8') : null;
    },
  };
}
