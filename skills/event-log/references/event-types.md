# Event Types Reference

All valid event types for `~/.openclaw/events.jsonl`.

---

## `skill_created`

A new OpenClaw skill was packaged and deployed.

```json
{
  "type": "skill_created",
  "summary": "Created skill: event-log",
  "meta": { "skill": "event-log", "path": "$HOME/openclaw/skills/event-log" }
}
```

---

## `project_created`

A new project was initialized.

```json
{
  "type": "project_created",
  "summary": "Created project: stock-watcher",
  "meta": { "id": "stock-watcher", "github": "<your-github-org>/stock-watcher" }
}
```

---

## `project_updated`

An existing project was modified or redeployed.

```json
{
  "type": "project_updated",
  "summary": "Updated web-monitor: added price check type",
  "meta": { "id": "web-monitor", "change": "price check type" }
}
```

---

## `notification_sent`

A Telegram or ntfy alert was sent.

```json
{
  "type": "notification_sent",
  "summary": "Stock alert sent for Eric Bloodaxe 1kg silver bar",
  "meta": { "channel": "telegram", "topic": "stock", "recipient": "<your-telegram-user-id>" }
}
```

---

## `cron_ran`

A scheduled cron job completed (successfully or with error).

```json
{
  "type": "cron_ran",
  "summary": "web-monitor check ran: all OK",
  "meta": { "job": "web-monitor", "success": true, "duration_ms": 312 }
}
```

---

## `alert_fired`

A watchdog or monitor raised an alert condition.

```json
{
  "type": "alert_fired",
  "summary": "Watchdog: webhook-receiver process not running",
  "meta": { "check": "process", "target": "webhook-receiver", "severity": "warn" }
}
```

---

## `task_completed`

A task queue item was completed.

```json
{
  "type": "task_completed",
  "summary": "Task done: deploy new cron schedule",
  "meta": { "task_id": "abc123", "queue": "main" }
}
```

---

## `error`

Something broke — script error, API failure, unexpected state.

```json
{
  "type": "error",
  "summary": "Failed to fetch Eric Bloodaxe URL: HTTP 503",
  "meta": { "url": "https://...", "code": 503, "script": "stock-watcher" }
}
```

---

## `note`

A free-form note from Kite or the user. Use for context, decisions, plans.

```json
{
  "type": "note",
  "summary": "Gateway auth fixed — sub-agents now working",
  "meta": { "author": "kite" }
}
```

---

## `session_start`

Kite's main session started. Logged automatically (when wired up in BOOTSTRAP or heartbeat).

```json
{
  "type": "session_start",
  "summary": "Session started",
  "meta": { "channel": "telegram", "model": "claude-sonnet-4-6" }
}
```

---

## `session_end`

Session closed cleanly.

```json
{
  "type": "session_end",
  "summary": "Session ended",
  "meta": {}
}
```

---

## Notes

- All types are lowercase snake_case strings.
- Unknown types are accepted by the log but flagged in `stats` output.
- `meta` is always an object — never null, never a string.
- Keep `summary` under 120 characters for clean display.
