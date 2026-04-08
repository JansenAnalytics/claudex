---
name: email-manager
description: "Read, search, send, and manage email via IMAP/SMTP or API (Gmail, Outlook)."
---

# email-manager

Read, search, send, and manage email via IMAP/SMTP or API (Gmail, Outlook).

## When to Use

- Checking inbox or unread messages
- Searching emails by sender, subject, date, or content
- Sending or composing email messages
- Managing folders (move, delete, archive)
- Setting up email automation or configuring clients programmatically

## Scripts

### `scripts/imap-reader.py`

Read inbox via IMAP. Connects, fetches recent messages, displays subject/from/date.

```bash
# List 10 most recent emails
python3 scripts/imap-reader.py --host imap.gmail.com --user you@gmail.com --password "app-password" --count 10

# Search by sender
python3 scripts/imap-reader.py --host imap.gmail.com --user you@gmail.com --password "app-password" --search "FROM someone@example.com"

# Dry-run (no server connection, shows sample output)
python3 scripts/imap-reader.py --dry-run
```

**Environment variables:** `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` (alternative to flags).

### `scripts/email-sender.py`

Send email via SMTP (supports Gmail, Outlook, custom SMTP).

```bash
# Send an email
python3 scripts/email-sender.py --host smtp.gmail.com --port 587 --user you@gmail.com --password "app-password" \
  --to recipient@example.com --subject "Hello" --body "Message body"

# Dry-run (compose without sending)
python3 scripts/email-sender.py --dry-run --to recipient@example.com --subject "Test" --body "Draft"
```

### `scripts/email-composer.py`

Compose and format emails (plain text or HTML). Always dry-run — outputs the composed message without sending.

```bash
# Compose a plain text email
python3 scripts/email-composer.py --to user@example.com --subject "Meeting" --body "Let's meet tomorrow at 10."

# Compose HTML email
python3 scripts/email-composer.py --to user@example.com --subject "Report" --html --body "<h1>Q4 Report</h1><p>See attached.</p>"
```

## References

- `references/imap-commands.md` — Common IMAP commands and search syntax
- `references/smtp-setup.md` — SMTP configuration for Gmail, Outlook, custom servers
- `references/gmail-api-quickstart.md` — Gmail API setup with OAuth2

## Requirements

- Python 3.8+
- No pip dependencies (uses stdlib: `imaplib`, `smtplib`, `email`)
- For Gmail: enable "App Passwords" or use OAuth2 via Gmail API

## Security Notes

- Never hardcode passwords in scripts; use env vars or credential files
- Gmail requires App Passwords (2FA enabled) or OAuth2
- IMAP/SMTP connections use TLS/SSL by default
