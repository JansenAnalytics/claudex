---
name: project-index
description: "Kite's project registry — a structured JSON index of all active projects."
---

# project-index

Kite's project registry — a structured JSON index of all active projects.
Always know what's running, what state it's in, and what comes next.

## Data file

`~/projects/index.json` — shared across all projects, one source of truth.

## CLI location

`/home/ajans/projects/project-index/index.cjs`

Alias: `alias pj="node /home/ajans/projects/project-index/index.cjs"`

## When to use

Use this skill whenever the user (or Kite internally) asks about:

- "what are you working on?"
- "show project status"
- "what's the status of X?"
- "update the project index"
- "mark X as done"
- "what's next for Y?"

## Commands

```bash
# List all projects
node /home/ajans/projects/project-index/index.cjs list

# Filter by status
node /home/ajans/projects/project-index/index.cjs list --status active

# Show full detail
node /home/ajans/projects/project-index/index.cjs show web-monitor

# Add a new project
node /home/ajans/projects/project-index/index.cjs add \
  --id my-tool \
  --name "My Tool" \
  --path ~/projects/my-tool \
  --github JansenAnalytics/my-tool \
  --desc "Does something cool" \
  --tags monitoring,cron \
  --cron "*/15 * * * *"

# Update a project
node /home/ajans/projects/project-index/index.cjs update web-monitor \
  --status active \
  --last-action "Fixed regex check" \
  --next "Add Slack notification"

# Append a note (timestamped)
node /home/ajans/projects/project-index/index.cjs note web-monitor "Added BTC price check"

# Mark done / archive
node /home/ajans/projects/project-index/index.cjs done stock-watcher
node /home/ajans/projects/project-index/index.cjs archive stock-watcher
```

## Kite behaviour

When the user asks about project status, Kite should:

1. Run `list` and present a clean summary
2. On `show <id>`, present all fields
3. After completing any task that modifies a project, run `update` or `note` to record it
4. When starting a new project, run `add` immediately

## Index schema

```json
{
  "id": "web-monitor",
  "name": "Web Monitor",
  "path": "/home/ajans/projects/web-monitor",
  "github": "JansenAnalytics/web-monitor",
  "status": "active",
  "description": "Configurable URL/content monitor",
  "last_action": "Deployed and watching Eric Bloodaxe silver bar",
  "next_steps": [],
  "tags": ["monitoring", "cron"],
  "cron": "*/15 * * * *",
  "created_at": "2026-02-21",
  "updated_at": "2026-02-21"
}
```

Fields:

- `status`: `active` | `done` | `archived` | `paused`
- `next_steps`: array of strings (append with `--next`)
- `cron`: null or cron expression
- `last_action`: free text, updated with `note` or `update --last-action`
