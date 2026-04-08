---
name: task-queue
description: Skill: task-queue
---

# Skill: task-queue

A persistent, JSON-backed job queue. Lets Kite schedule and manage shell commands without raw cron. One-shot tasks (run at a specific time) and recurring tasks (cron schedule) are both supported.

## Trigger phrases

- "schedule a task / job"
- "run [command] at [time]"
- "run [command] every [N] minutes/hours"
- "add to the task queue"
- "what tasks are scheduled / queued"
- "list my tasks"
- "cancel task [id]"
- "clear done tasks"
- "task status [id]"

## Files

| File                               | Purpose                      |
| ---------------------------------- | ---------------------------- |
| `~/projects/task-queue/queue.json` | Task store (source of truth) |
| `~/projects/task-queue/cli.cjs`    | CLI tool for managing tasks  |
| `~/projects/task-queue/runner.cjs` | Runner — executes due tasks  |
| `~/projects/task-queue/runner.log` | Runner output log            |

Skill copies live in `/home/ajans/openclaw/skills/task-queue/scripts/`.

## Quick reference

```bash
# Add one-shot task
node ~/projects/task-queue/cli.cjs add "name" "command" --at "2026-02-21T18:00:00"

# Add recurring task (every 15 min)
node ~/projects/task-queue/cli.cjs add "name" "command" --every "*/15 * * * *"

# Add immediate task (runs next runner tick)
node ~/projects/task-queue/cli.cjs add "name" "command"

# List all / filter
node ~/projects/task-queue/cli.cjs list
node ~/projects/task-queue/cli.cjs list --status pending

# Details for one task
node ~/projects/task-queue/cli.cjs status <id>

# Cancel / mark done
node ~/projects/task-queue/cli.cjs cancel <id>
node ~/projects/task-queue/cli.cjs done <id>

# Housekeeping
node ~/projects/task-queue/cli.cjs clear --done
node ~/projects/task-queue/cli.cjs clear --failed
node ~/projects/task-queue/cli.cjs clear --all

# Run runner manually (normally cron does this)
node ~/projects/task-queue/runner.cjs

# Tail log
tail -f ~/projects/task-queue/runner.log
```

## Cron entry

```
* * * * * /usr/bin/node /home/ajans/projects/task-queue/runner.cjs >> /home/ajans/projects/task-queue/runner.log 2>&1
```

## Task schema

```json
{
  "id": "a1b2c3d4",
  "name": "human name",
  "command": "echo hello",
  "type": "one-shot | recurring",
  "status": "pending | running | done | failed | cancelled",
  "scheduled_at": "2026-02-21T18:00:00.000Z",
  "cron_expr": "*/15 * * * *",
  "created_at": "...",
  "started_at": "...",
  "finished_at": "...",
  "last_run_at": "...",
  "output": "...",
  "error": "..."
}
```

## Notes

- Cron expression support: `*`, `*/N`, `N-M`, `N,M,…` for each field
- Runner timeout: 5 minutes per task
- Recurring tasks stay `pending` after each run so they fire again next cycle
- One-shot tasks become `done` (or `failed`) after their single execution
- No npm packages — pure Node.js built-ins

---

## Pipelines (resumable multi-step tasks)

Pipelines are multi-step tasks where each step is checkpointed. On failure, retry skips already-completed steps and resumes from where it left off.

### Files

| File                                        | Purpose                                  |
| ------------------------------------------- | ---------------------------------------- |
| `~/projects/task-queue/pipelines.json`      | Pipeline store                           |
| `~/projects/task-queue/pipeline-runner.cjs` | Cron runner for pipelines (every minute) |
| `~/projects/task-queue/pipeline-runner.log` | Pipeline runner log                      |

### Quick reference

```bash
# Add a pipeline (steps as inline JSON)
node ~/projects/task-queue/cli.cjs pipeline add "Deploy app" \
  --steps '[{"name":"Run tests","command":"cd ~/myapp && npm test"},{"name":"Push","command":"cd ~/myapp && git push"}]'

# Add a pipeline from a steps file
node ~/projects/task-queue/cli.cjs pipeline add "Deploy app" --steps-file /path/to/steps.json

# List all pipelines (shows step progress)
node ~/projects/task-queue/cli.cjs pipeline list

# Detailed status (per-step output and errors)
node ~/projects/task-queue/cli.cjs pipeline status <id>

# Retry a failed pipeline (skips done steps, re-runs from failure point)
node ~/projects/task-queue/cli.cjs pipeline retry <id>

# Cancel / delete
node ~/projects/task-queue/cli.cjs pipeline cancel <id>
node ~/projects/task-queue/cli.cjs pipeline delete <id>
```

### Steps file format

```json
[
  { "name": "Step 1", "command": "echo hello", "timeout_ms": 60000 },
  { "name": "Step 2", "command": "echo world" }
]
```

### Pipeline schema

```json
{
  "id": "abc12345",
  "name": "My pipeline",
  "status": "queued | running | done | failed | cancelled",
  "current_step": 1,
  "steps": [
    {
      "id": "step-1",
      "name": "Step name",
      "command": "shell command",
      "status": "pending | running | done | failed | skipped",
      "timeout_ms": 600000,
      "started_at": null,
      "finished_at": null,
      "output": null,
      "error": null
    }
  ]
}
```

### Trigger phrases

- "run these steps as a pipeline"
- "resumable task / pipeline"
- "retry from where it failed"
- "checkpoint after each step"
