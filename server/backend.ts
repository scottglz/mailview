// What the web app needs from the archive. Two implementations: the Mail-Archiver REST API (api.ts) and a
// fake mailbox for design work without real mail (demo.ts).

export interface Account {
  id: number;
  name: string;
  emailAddress: string;
  isEnabled: boolean;
  lastSync: string | null;
}

export interface Folder {
  name: string;
  fullPath: string;
  totalCount: number;
  children: Folder[];
}

export interface Summary {
  id: number;
  accountId: number;
  subject: string;
  from: string;
  to: string;
  sentDate: string;
  isOutgoing: boolean;
  hasAttachments: boolean;
  folderName: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AttachmentMeta {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
}

export interface Detail extends Summary {
  cc: string;
  bcc: string;
  receivedDate: string;
  messageId: string;
  textBody: string | null;
  htmlBody: string | null;
  attachments: AttachmentMeta[];
  hasRawMessage: boolean;
}

export interface SearchParams {
  accountId: number;
  q?: string;
  folder?: string;
  direction?: 'incoming' | 'outgoing';
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  sortOrder?: 'asc' | 'desc';
}

export interface Backend {
  accounts(): Promise<Account[]>;
  folders(accountId: number): Promise<Folder[]>;
  search(params: SearchParams): Promise<Paged<Summary>>;
  message(id: number): Promise<Detail | null>;
  attachment(emailId: number, attachmentId: number): Promise<Uint8Array | null>;
  /** The message as received (or, if no original was stored, as rebuilt by Mail-Archiver). */
  original(id: number): Promise<Uint8Array | null>;
}
