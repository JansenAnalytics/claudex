---
name: event-log
description: "An append-only structured JSONL event log giving Kite continuity across sessions — without reading every log file."
---

# event-log

An append-only structured JSONL event log giving Kite continuity across sessions — without reading every log file.

## What it does

Writes structured events to `~/.openclaw/events.jsonl`. Each event captures a timestamp, type, session ID, human-readable summary, and optional metadata. Kite can query the log at the start of any session to instantly know what happened recently.

## Event file

```
~/.openclaw/events.jsonl
```

Each line is one JSON event:

```json
{
  "ts": "2026-02-21T17:00:00Z",
  "type": "note",
  "session": "agent:main:abc",
  "summary": "Gateway auth fixed",
  "meta": {}
}
```

## Script location

```
/home/ajans/projects/event-log/event-log.cjs
```

Also symlinked in skill scripts for reference:

```
/home/ajans/openclaw/skills/event-log/scripts/event-log.cjs
```

## CLI usage

```bash
# Log an event
node /home/ajans/projects/event-log/event-log.cjs log \
  --type note --summary "Started working on X"

# With metadata
node /home/ajans/projects/event-log/event-log.cjs log \
  --type notification_sent \
  --summary "Sent stock alert" \
  --meta '{"channel":"telegram","topic":"stock"}'

# View last 20 events
node /home/ajans/projects/event-log/event-log.cjs tail

# View last 50
node /home/ajans/projects/event-log/event-log.cjs tail --n 50

# Events from today
node /home/ajans/projects/event-log/event-log.cjs today

# Search summaries
node /home/ajans/projects/event-log/event-log.cjs search "stock"

# Filter by type
node /home/ajans/projects/event-log/event-log.cjs type notification_sent

# Events since a date
node /home/ajans/projects/event-log/event-log.cjs since "2026-02-21"

# Stats: counts by type, today/week
node /home/ajans/projects/event-log/event-log.cjs stats
```

## Programmatic API

```js
const { logEvent } = require("/home/ajans/projects/event-log/event-log.cjs");

logEvent("notification_sent", "Stock alert fired", { channel: "telegram" });
logEvent("cron_ran", "web-monitor check complete", { success: true, duration_ms: 312 });
logEvent("error", "Failed to reach Eric Bloodaxe URL", { url: "https://...", code: 503 });
```

## Trigger phrases (Kite)

When Aksel says any of these, Kite should query the event log:

- "What happened today?"
- "What did you do today?"
- "Show recent events"
- "Show me the log"
- "Log a note: …"
- "What's been running?"
- "Any errors recently?"
- "Show notifications"

## Session startup

At the start of each main session, Kite should run:

```bash
node /home/ajans/projects/event-log/event-log.cjs today
```

This gives immediate context without reading every log file.

## Event types reference

See `references/event-types.md` for full type definitions.

## Dependencies

- Node.js (built-in `fs`, `path`, `os` only — no npm)
- `~/.openclaw/` directory (auto-created if missing)
