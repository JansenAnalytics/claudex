---
name: event-log
description: "An append-only structured JSONL event log giving Kite continuity across sessions — without reading every log file."
category: productivity
maturity: stable
tags: [jsonl, event-log, session-continuity, append-only, audit-trail]
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
${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs
```

Also symlinked in skill scripts for reference:

```
${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/event-log/scripts/event-log.cjs
```

## CLI usage

```bash
# Log an event
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs log \
  --type note --summary "Started working on X"

# With metadata
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs log \
  --type notification_sent \
  --summary "Sent stock alert" \
  --meta '{"channel":"telegram","topic":"stock"}'

# View last 20 events
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs tail

# View last 50
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs tail --n 50

# Events from today
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs today

# Search summaries
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs search "stock"

# Filter by type
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs type notification_sent

# Events since a date
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs since "2026-02-21"

# Stats: counts by type, today/week
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs stats
```

## Programmatic API

```js
const { logEvent } = require("${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs");

logEvent("notification_sent", "Stock alert fired", { channel: "telegram" });
logEvent("cron_ran", "web-monitor check complete", { success: true, duration_ms: 312 });
logEvent("error", "Failed to reach Eric Bloodaxe URL", { url: "https://...", code: 503 });
```

## Trigger phrases (Kite)

When the user says any of these, Kite should query the event log:

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
node ${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs today
```

This gives immediate context without reading every log file.

## Event types reference

See `references/event-types.md` for full type definitions.

## Dependencies

- Node.js (built-in `fs`, `path`, `os` only — no npm)
- `~/.openclaw/` directory (auto-created if missing)
