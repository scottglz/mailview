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

export interface Page {
  items: Summary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Person {
  name: string;
  address: string;
}

export type PreviewKind = 'image' | 'pdf' | 'text' | null;

export interface Attachment {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
  preview: PreviewKind;
  inline: boolean;
}

export interface Message {
  id: number;
  accountId: number;
  subject: string;
  sentDate: string;
  folderName: string;
  isOutgoing: boolean;
  from: Person;
  to: Person[];
  cc: Person[];
  bcc: Person[];
  replyTo: Person[];
  hasHtml: boolean;
  hasRemoteContent: boolean;
  text: string | null;
  hasOriginal: boolean;
  attachments: Attachment[];
}

/** Everything that defines what the list shows; mirrored in the address bar. */
export interface View {
  account: number | null;
  q: string;
  folder: string;
  direction: '' | 'incoming' | 'outgoing';
  from: string;
  to: string;
  sort: 'desc' | 'asc';
  id: number | null;
}
