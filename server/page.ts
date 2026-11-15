// The web app's HTML shell, with this installation's title and UI settings filled in.
import type { UiSettings } from './config.ts';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/**
 * Sets the <title> and adds the settings as a JSON data block. The page's CSP (script-src 'self') allows it because
 * it is data, never run. "<" is escaped so a value can't close the block.
 */
export function withSettings(html: string, ui: UiSettings): string {
  const json = JSON.stringify(ui).replace(/</g, '\\u003c');
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(ui.appName)}</title>`)
    .replace('</head>', () => `<script id="mv-settings" type="application/json">${json}</script></head>`);
}
