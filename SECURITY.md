# Security

mailview sits in front of people's whole email archives, so security reports are very welcome.

## Reporting a problem

Please report vulnerabilities **privately** through GitHub: the repository's **Security** tab → **Report a
vulnerability**. Don't open a public issue.

Include what you found, how to reproduce it, and which version or commit you tested. I'll confirm receipt, work on a
fix, and credit you in the release notes unless you'd rather not be named. This is a hobby project, so there is no
guaranteed response time, but security reports come first.

## In scope

- Anything that lets someone read mail they shouldn't: bypassing sign-in or the user allowlist, seeing another
  person's mailbox, session fixation or theft.
- Script execution or data leaks through email content (the HTML body frame, attachments, previews).
- Problems in the published container image.

## Out of scope

- Vulnerabilities in Mail-Archiver itself (report those to Mail-Archiver), in your OpenID Connect provider, or in a
  setup that exposes Mail-Archiver's `/api` to the internet against the README's advice.
- Senders learning that an email was opened when `REMOTE_IMAGES=allow` is set: that's what the setting does.

## Supported versions

Only the latest release gets fixes.
