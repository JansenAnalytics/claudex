# Inbox — Task Queue for the Agent

The inbox is a simple JSON-based task queue. It lets external systems (cron jobs, webhooks, scripts) queue work for the agent to pick up at the start of each session — without needing a live connection.

## Data file

`~/.claude-agent/data/inbox.json` — an array of task objects:

```json
[
  {
    "id": "a1b2c3",
    "task": "Check email for important messages",
    "source": "cron",
    "priority": "normal",
    "queued_at": "2026-04-13T03:00:00+02:00",
    "status": "pending"
  }
]
```

**Priorities:** `high` (🔴) · `normal` (🟡) · `low` (🔵)  
**Sources:** `cron` · `webhook` · `manual`  
**Status:** `pending` → `done`

---

## CLI usage

```bash
SCRIPT="node ~/.claude-agent/scripts/inbox.cjs"

# Add a task
$SCRIPT --add "Morning briefing"
$SCRIPT --add "Deploy staging" --priority high --source webhook
$SCRIPT --add "Low-priority cleanup" --priority low --source cron

# List pending tasks (sorted: high→normal→low, oldest first)
$SCRIPT --list

# Pop the highest-priority task and remove it
$SCRIPT --pop
$SCRIPT --pop --json          # JSON output

# Pop ALL pending tasks at once
$SCRIPT --pop --all

# Mark a task done (keeps it in file with status=done)
$SCRIPT --done a1b2c3

# Remove all completed tasks from the file
$SCRIPT --clear

# Any command + --json → machine-readable output
$SCRIPT --list --json
```

---

## Adding tasks from cron

Edit crontab with `crontab -e`:

```cron
# Morning briefing at 08:00 every weekday
0 8 * * 1-5  node ~/.claude-agent/scripts/inbox.cjs --add "Morning briefing: check email, calendar, news" --source cron --priority high

# Daily low-priority cleanup reminder
0 22 * * *   node ~/.claude-agent/scripts/inbox.cjs --add "End-of-day: rotate logs and summarize today" --source cron --priority low

# Weekly review every Monday 09:00
0 9 * * 1    node ~/.claude-agent/scripts/inbox.cjs --add "Weekly review: reflect on last week, plan this week" --source cron --priority normal
```

---

## Adding tasks from webhooks

A webhook handler (e.g. Express, or a simple bash script called by nginx) can queue tasks:

```bash
# Example: GitHub webhook triggers a PR review task
node ~/.claude-agent/scripts/inbox.cjs \
  --add "Review PR #${PR_NUMBER}: ${PR_TITLE}" \
  --source webhook \
  --priority normal
```

Or from a Node.js webhook handler:

```js
const { execSync } = require('child_process');
app.post('/webhook/github', (req, res) => {
  const { number, title } = req.body.pull_request;
  execSync(`node ~/.claude-agent/scripts/inbox.cjs --add "Review PR #${number}: ${title}" --source webhook --priority normal`);
  res.sendStatus(200);
});
```

---

## How the agent processes the inbox

At session start, `session-init.sh` checks for pending tasks and prints them to the console:

```
📥 Inbox (2 pending)
  🔴 [a1b2c3] Morning briefing: check email, calendar, news   (cron, 2h ago)
  🔵 [d4e5f6] End-of-day: rotate logs and summarize today     (cron, 14h ago)
```

The agent sees this output and should:
1. Acknowledge the inbox at session start
2. Process high-priority items first
3. Mark each task done with `--done ID` when complete
4. Run `--clear` periodically to remove old completed tasks

To process tasks programmatically (e.g. in a script that feeds tasks to the agent):

```bash
# Get the next task as JSON
TASK=$(node ~/.claude-agent/scripts/inbox.cjs --pop --json)
echo "$TASK" | jq -r '.task'   # extract description

# After handling it:
ID=$(echo "$TASK" | jq -r '.id')
node ~/.claude-agent/scripts/inbox.cjs --done "$ID"
```

---

## Notes

- Max 50 pending tasks — a warning is shown when exceeded
- Tasks are sorted: high → normal → low, then oldest-first within each priority
- `--pop` removes the task from the file (gone); `--done` keeps it with `status=done`
- File format is plain JSON — easy to inspect and edit manually
