# Persistence: Keeping Claude Code Running 24/7

## The Problem

Claude Code is an interactive CLI tool. It expects a human on the other end. Sessions can time out, SIGTERM kills them instantly, and there's no built-in daemon mode. If you want it running unattended around the clock, you have to build that infrastructure yourself.

Three separate failure modes need to be handled:

1. **Terminal disconnect** — you close your SSH session and Claude dies with it
2. **System reboot** — power cycle, kernel update, scheduled restart
3. **Process stall or crash** — Claude hangs, OOM-kills it, or it exits cleanly but shouldn't have

Each layer below handles one of these. You need all three.

---

## Layer 1: tmux Session

Claude Code requires a PTY (pseudo-terminal). It doesn't just want one — it won't run without one. When systemd launches a process, there's no terminal attached. When your SSH session closes, the terminal is gone. tmux solves both problems by maintaining a virtual terminal that persists independently of any actual connected user.

### Starting the session

```bash
tmux new-session -d -s claudex -c /path/to/workspace \
  "claude --dangerously-skip-permissions --channels telegram --continue"
```

- `-d` — detach immediately (don't attach to the terminal that launched it)
- `-s claudex` — session name, used to reattach later
- `-c /path/to/workspace` — sets the working directory inside the session

### Checking on it

```bash
tmux attach -t claudex        # attach and watch
tmux ls                        # list all sessions
tmux send-keys -t claudex "" Enter   # send a no-op to test if it's alive
```

### What tmux survives

- ✅ SSH disconnect
- ✅ Terminal close
- ❌ System reboot
- ❌ tmux server crash
- ❌ OOM kill of the tmux process itself

That's why you need Layer 2.

---

## Layer 2: systemd User Service

systemd handles boot-time startup and automatic restart on crash. The critical detail: this must be a **user service**, not a system service. Claude Code runs as your user, reads your home directory, and needs your OAuth credentials. Running it as root or a system service breaks all of that.

### Enable linger (critical step)

```bash
loginctl enable-linger $USER
```

Without this, systemd destroys all user services the moment you log out — even if no terminal session is active. Linger tells the system to keep your user's systemd instance alive permanently, regardless of whether you're logged in.

### Unit file

Place this at `~/.config/systemd/user/claudex.service`:

```ini
[Unit]
Description=Claudex - Claude Code Autonomous Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/USER/.claude-agent
ExecStart=/home/USER/.claude-agent/scripts/start-claudex.sh
Restart=on-failure
RestartSec=30
Environment=HOME=/home/USER
Environment=PATH=/usr/local/bin:/usr/bin:/bin:/home/USER/.local/bin:/home/USER/.nvm/versions/node/v22.22.0/bin
KillMode=process
TimeoutStopSec=30

[Install]
WantedBy=default.target
```

**Directive explanations:**

- `After=network.target` — wait for network before starting. Claude needs internet for the Anthropic API.
- `Type=simple` — systemd treats the ExecStart process as the main process. When it dies, systemd sees it as a service failure and restarts it.
- `WorkingDirectory` — sets `$PWD` for the start script. Ensures relative paths in scripts work correctly.
- `ExecStart` — points to the start script rather than Claude directly. The script handles PTY setup and environment cleanup (see below).
- `Restart=on-failure` — restart only on non-zero exit. If you manually `systemctl stop claudex`, it stays stopped. If it crashes, it restarts.
- `RestartSec=30` — wait 30 seconds before restarting. Prevents a tight crash loop from hammering the API with auth errors.
- `Environment=HOME` — explicitly set `$HOME`. systemd's environment is minimal; without this, Claude can't find its config files.
- `Environment=PATH` — include Node.js and local bin paths. systemd doesn't inherit your shell's PATH.
- `KillMode=process` — when stopping, only kill the main process (the start script), not the entire process group. This lets tmux and Claude wind down on their own terms.
- `TimeoutStopSec=30` — give it 30 seconds to stop gracefully before SIGKILL.
- `WantedBy=default.target` — enables the service for normal user session startup.

### Enabling and starting

```bash
systemctl --user daemon-reload
systemctl --user enable claudex
systemctl --user start claudex
systemctl --user status claudex
```

---

## The Start Script

The start script is the glue between systemd and tmux. It handles the PTY problem and environment cleanup.

```bash
#!/usr/bin/env bash
# ~/.claude-agent/scripts/start-claudex.sh

set -euo pipefail

WORKSPACE="/home/USER/.claude-agent"
SESSION="claudex"
LOG="$WORKSPACE/logs/claude.log"

mkdir -p "$WORKSPACE/logs"

# THE ANTHROPIC_API_KEY PROBLEM:
# If this env var is set, Claude prompts interactively:
#   "Use API key or OAuth? [1/2]"
# This blocks autonomous restart — no one is there to answer.
# Unset it so Claude falls through to OAuth automatically.
unset ANTHROPIC_API_KEY

# Kill any existing tmux session with this name
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Wait a moment for cleanup
sleep 2

# Start Claude inside a new tmux session, logging output
# The `script` wrapper provides the PTY that Claude requires.
# Without a PTY, Claude exits silently — no error, no warning, just gone.
tmux new-session -d -s "$SESSION" -c "$WORKSPACE" \
  "script -qc 'claude --dangerously-skip-permissions --channels telegram --continue' $LOG"

echo "Claudex started in tmux session '$SESSION'"
```

Make it executable: `chmod +x ~/.claude-agent/scripts/start-claudex.sh`

---

## Layer 3: Watchdog Cron

systemd's `Restart=on-failure` handles crashes, but not stalls. A more subtle failure mode: Claude's process is alive, bun is running, messages arrive — but responses never reach Telegram. The outbound MCP channel between Claude and the Telegram plugin silently dies. The process looks healthy from the outside.

The watchdog runs every 5 minutes and performs **three checks**:

```
*/5 * * * * bash ~/.claude-agent/scripts/watchdog-claudex.sh
```

### Check 1: Process liveness

Basic `pgrep` for the Claude process. If it's gone, restart immediately.

### Check 2: Session age (24h proactive restart)

Tracks the session start time in `data/watchdog_session_start`. After 24 hours, proactively restarts with a fresh session. This prevents the Telegram plugin's outbound MCP channel from silently rotting — a real failure mode observed in long-running sessions.

```bash
SESSION_AGE=$(( NOW - SESSION_START ))
MAX_SESSION_AGE=$(( 24 * 3600 ))  # 24 hours
if [ "$SESSION_AGE" -gt "$MAX_SESSION_AGE" ]; then
    do_restart "session age exceeds 24h limit — proactive refresh"
fi
```

### Check 3: Telegram delivery health

Counts inbound message files in `~/.claude/channels/telegram/inbox/`. If the count grows (new messages arrived) but no delivery is confirmed after 10 minutes, the watchdog checks whether Claude is actively working by inspecting the tmux pane:

```bash
PANE=$(tmux capture-pane -t claudex -p)
if echo "$PANE" | grep -q "✻\|Thinking\|Running\|Executing"; then
    # Actively working — skip restart, keep waiting
else
    # Idle at prompt, delivery stuck — restart
    do_restart "Telegram delivery stuck"
fi
```

This is important: **long tasks are safe**. If Claudex is working on a 45-minute build, the watchdog sees the activity indicators and leaves it alone. It only restarts when Claude is visibly idle but hasn't sent a response.

### Cron entry

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * bash ~/.claude-agent/scripts/watchdog-claudex.sh") | crontab -
```

---

## The PTY Problem

Claude Code detects whether it's running in a terminal. If there's no TTY, it refuses to run — but it doesn't say why. The process just exits with code 0. Clean exit. No log message. Infuriating to debug.

Two solutions:

**Option A: `script` wrapper** (used in the start script above)
```bash
script -qc "claude --dangerously-skip-permissions ..." /path/to/logfile
```
`script` allocates a PTY and records the session to a file. `-q` suppresses the "Session started" banner. Claude sees a real terminal, behaves normally.

**Option B: tmux directly**
```bash
tmux new-session -d -s claudex "claude ..."
```
tmux itself provides a PTY. Simpler, but you don't get a plain log file — you'd need `tmux pipe-pane` to capture output.

Both work. The start script above uses both: tmux for session management, `script` for logging.

---

## The --continue Flag

```bash
claude --continue
```

This tells Claude to resume the most recent conversation instead of starting fresh. Without it, every restart is a cold start — Claude wakes up with no memory of what it was doing, no context from previous sessions.

With `--continue`, Claude picks up where it left off. It remembers recent instructions, active tasks, and the general state of work. This is essential for autonomous operation.

---

## The First-Start Problem

`--dangerously-skip-permissions` bypasses the per-tool permission prompts during a session. But the very first time Claude Code runs, it asks for explicit confirmation that you understand the risks of running in this mode. No flag skips this.

**Solution:** Run Claude interactively once, manually confirm the prompt, then let the automated startup take over. Every subsequent restart — via systemd or watchdog — will skip the prompt because the confirmation has already been stored.

```bash
claude --dangerously-skip-permissions --channels telegram
# → Confirm the "I understand" prompt
# → Ctrl+C to exit
# → From now on, automated restarts work
```

---

## Management Scripts

### Status check

```bash
#!/usr/bin/env bash
# ~/.claude-agent/scripts/status.sh

echo "=== Claudex Status ==="
echo ""

# Layer 1: tmux
echo "tmux session:"
if tmux has-session -t claudex 2>/dev/null; then
  echo "  ✅ Running"
  tmux list-panes -t claudex -F "  Pane #{pane_index}: #{pane_current_command}" 2>/dev/null
else
  echo "  ❌ Not found"
fi

echo ""

# Layer 2: systemd
echo "systemd service:"
systemctl --user is-active claudex.service 2>/dev/null \
  && echo "  ✅ Active" \
  || echo "  ❌ Inactive"

echo ""

# Claude process
echo "Claude process:"
PID=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null | head -1)
if [ -n "$PID" ]; then
  echo "  ✅ PID $PID"
  ps -p "$PID" -o pid,etime,rss --no-headers | \
    awk '{ printf "  Uptime: %s | Memory: %d MB\n", $2, $3/1024 }'
else
  echo "  ❌ Not running"
fi

echo ""

# Watchdog log tail
LOG="$HOME/.claude-agent/logs/watchdog.log"
if [ -f "$LOG" ] && [ -s "$LOG" ]; then
  echo "Last watchdog events:"
  tail -3 "$LOG" | sed 's/^/  /'
else
  echo "Watchdog log: empty (no restarts)"
fi
```

### Stop

```bash
#!/usr/bin/env bash
# ~/.claude-agent/scripts/stop.sh

systemctl --user stop claudex.service 2>/dev/null || true
tmux kill-session -t claudex 2>/dev/null || true
pkill -f "claude.*channels.*telegram" 2>/dev/null || true
echo "Claudex stopped."
```

### Restart

```bash
#!/usr/bin/env bash
# ~/.claude-agent/scripts/restart.sh

bash "$(dirname "$0")/stop.sh"
sleep 3
systemctl --user start claudex.service
echo "Claudex restarting..."
sleep 2
bash "$(dirname "$0")/status.sh"
```

---

## Quick Reference

| Problem | Layer | Solution |
|---|---|---|
| SSH disconnect kills Claude | tmux | Detached session survives |
| Reboot kills everything | systemd | `WantedBy=default.target` |
| Process hangs undetected | watchdog cron | `pgrep` check every 5 min |
| No PTY in systemd | start script | `script -qc` wrapper |
| API key blocks auto-login | start script | `unset ANTHROPIC_API_KEY` |
| Cold start on every restart | `--continue` flag | Resumes last conversation |
| First-run confirmation | manual step | Do it once, done forever |
