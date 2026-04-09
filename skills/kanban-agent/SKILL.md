---
description: "Persistent task board backed by SQLite. Survives across sessions. Supports priorities (p0-p3), statuses (backlog → todo → in-progress → review → done), deadlines, dependencies, projects, tags, and ..."
name: kanban-agent
triggers:
  - add task
  - task list
  - what's on my plate
  - standup
  - track this
  - todo
  - project status
  - overdue
  - blocked
---

# Kanban Agent Skill

## Overview

Persistent task board backed by SQLite. Survives across sessions. Supports priorities (p0-p3), statuses (backlog → todo → in-progress → review → done), deadlines, dependencies, projects, tags, and full history logging.

## Script

```bash
node ~/openclaw/skills/kanban-agent/scripts/kanban.cjs <command> [args]
```

## Commands

### Task Management
```bash
kanban add "title" [--desc "..."] [--priority p0-p3] [--project X] [--tags "a,b"] [--deadline YYYY-MM-DD] [--depends 1,2] [--status STATUS]
kanban update <id> [--title "..."] [--desc "..."] [--priority p0-p3] [--project X] [--tags "a,b"] [--deadline YYYY-MM-DD] [--note "..."]
kanban move <id> <backlog|todo|in-progress|review|done|blocked|cancelled>
kanban done <id> [--note "completion note"]
kanban block <id> --reason "why"
kanban unblock <id>
kanban delete <id>
```

### Viewing
```bash
kanban list [--status todo,in-progress] [--priority p0,p1] [--project X] [--tag work] [--flat] [--limit N]
kanban show <id>           — full detail + dependencies + history
kanban search "query"      — search title, description, notes, tags
kanban deps <id>           — dependency tree
kanban overdue             — tasks past deadline
```

### Reports
```bash
kanban standup [--days 1]  — daily standup (completed, in-progress, blocked, up next)
kanban projects            — project progress bars
kanban stats               — overall statistics
kanban export [--format json|markdown]
```

## Agent Behavior

### Auto-creating tasks
When Aksel mentions something to do, track, or remember — create a task:
```bash
node kanban.cjs add "Wire onTokenSelect in Market Dashboard" --project brewboard --priority p2 --tags "frontend"
```

### During heartbeats
Run `kanban standup` to check what's active, blocked, or overdue. Report anything urgent.

### Completing work
After finishing a task, mark it done:
```bash
node kanban.cjs done 5 --note "Implemented and tested"
```

### Priority Guide
- **p0** 🔴 Critical — blocking Aksel or production
- **p1** 🟠 High — should do today/tomorrow
- **p2** 🟡 Normal — this week
- **p3** ⚪ Nice-to-have — when time permits

## Database

- **Location:** `~/.kanban/tasks.db` (SQLite, WAL mode)
- **Tables:** tasks, dependencies, task_log
- **Env override:** `KANBAN_DB=/path/to/tasks.db`
