# Changelog

## 0.3.1 - 2026-11-22

- The image no longer contains npm, npx, corepack or yarn from the Node base image. Nothing used them at runtime, and
  npm's bundled dependencies were the image's only Trivy findings.
- postal-mime 4.2.1 (security): deeply nested multipart messages no longer slow parsing down, and sender addresses
  are read as RFC 5322 reads them.
- Node 24.22.3, hono 4.13.18, @hono/node-server 2.1.8, openid-client 6.9.0; build tools vite 8.3.8 and
  @vitejs/plugin-react 6.3.0.

## 0.3.0 - 2026-11-20

- `MAILVIEW_USERS` entries can be email addresses (`alice@example.com=alice`), matched case-insensitively and only
  when the provider marks the address verified. No more looking up a provider's user id (with Google, only a refused
  sign-in shows it). User ids work as before; with no email entries, only the `openid` scope is requested.
- The "sign-in refused" log line says why (not listed, no verified email, or no key) and never logs the email.

## 0.2.0 - 2026-11-14

First public release.

- Read-only UI for Mail-Archiver's REST API: mailboxes and folders, search with filters, HTML and text reading,
  attachment previews and downloads, original message download, light and dark theme, demo mode.
- One Mail-Archiver API key per person; sign-in with any OpenID Connect provider and an allowlist of user ids.
- Settings for the app name, sign-in wording and remote pictures (`ask` by default).
