// Inline stroke icons (24px grid, currentColor), so there's no icon font or extra request.
import type { ReactNode } from 'react';

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number };
export const SearchIcon = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const InboxIcon = (p: P) => <Icon {...p}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6z" /></Icon>;
export const SentIcon = (p: P) => <Icon {...p}><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4z" /></Icon>;
export const ReceivedIcon = (p: P) => <Icon {...p}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></Icon>;
export const ChatIcon = (p: P) => <Icon {...p}><path d="M4 5h16v11H9l-5 4z" /></Icon>;
export const FolderIcon = (p: P) => <Icon {...p}><path d="M3 6h6l2 2h10v11H3z" /></Icon>;
export const ClipIcon = (p: P) => <Icon {...p}><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7L9.2 17.2a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></Icon>;
export const DownloadIcon = (p: P) => <Icon {...p}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></Icon>;
export const OpenIcon = (p: P) => <Icon {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M19 14v6H4V5h6" /></Icon>;
export const FileIcon = (p: P) => <Icon {...p}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /></Icon>;
export const ImageIcon = (p: P) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></Icon>;
export const BackIcon = (p: P) => <Icon {...p}><path d="M15 5 8 12l7 7" /></Icon>;
export const CloseIcon = (p: P) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const MenuIcon = (p: P) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
export const SortIcon = (p: P) => <Icon {...p}><path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4" /></Icon>;
export const ShieldIcon = (p: P) => <Icon {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /></Icon>;
export const ChevronIcon = (p: P) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>;
export const SunIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
export const MoonIcon = (p: P) => <Icon {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Icon>;
