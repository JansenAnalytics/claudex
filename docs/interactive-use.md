# Running Claudex interactively (IDE / SSH) + session persistence

Claudex's default deployment is the 24/7 Telegram daemon ([persistence.md](persistence.md) — systemd +
watchdog). But you can also run it **interactively**: launch `claude` yourself in a terminal (or an IDE's
integrated terminal, often over SSH to the machine where Claudex lives) and drive it hands-on — no Telegram,
no systemd. This is the natural mode for building inside a specific repo.

The catch is persistence. An interactive `claude` is tied to your terminal's PTY, so when the SSH link drops
— laptop sleep, switching networks — the process gets `SIGHUP` and dies. The conversation transcript is saved
to disk, so you don't lose *context*; you lose the *live process*. This guide is about not losing it.

## Interactive vs. the headless daemon

| | Headless daemon | Interactive |
|---|---|---|
| Launch | systemd unit + start script | you run `claude` in a terminal |
| Channel | Telegram | the terminal you're sitting at |
| Survives reboot | yes (systemd) | no — you relaunch |
| Survives SSH drop | yes (tmux, see below) | **only if you run it in tmux** |

The remote box itself usually stays up; when your laptop sleeps, only the **client** connection drops. So if
the session runs in tmux on the server, it just keeps going and you reattach.

## Keep the session alive: tmux

Run Claude inside a tmux session so it survives disconnects:

```bash
tmux new -A -s claudex-ide     # attach if it exists, else create
claude                          # run Claude inside it (add --continue to resume the last session)
# detach (leave it running): Ctrl-b then d
# list sessions:              tmux ls
# reattach after reconnect:   tmux attach -t claudex-ide
```

`tmux new -A` = attach-or-create, so reconnecting and re-running never spawns a duplicate.

**Make it automatic.** If you launch via a wrapper script, have the script re-`exec` itself inside tmux so
persistence is free:

```bash
# near the top of your launcher, before the real `exec claude …`
if [ -z "${TMUX:-}" ] && [ -t 1 ] && command -v tmux >/dev/null 2>&1; then
    exec tmux new-session -A -s "claudex-ide" "$(readlink -f "$0")" "$@"
fi
```

- `[ -t 1 ]` guards it to a real terminal, so non-interactive / `claude -p` runs skip the wrap.
- Pick a session name that does **not** collide with the daemon's `claudex` session (e.g. `claudex-ide` or
  one per project).
- Add an opt-out env var (e.g. `NO_TMUX=1`) if you sometimes want to launch without it.

## SSH keepalives (client side)

On the machine you SSH *from*, add to `~/.ssh/config` so brief blips don't drop the link:

```sshconfig
Host <your-host>
    ServerAliveInterval 30
    ServerAliveCountMax 4
    TCPKeepAlive yes
```

These ride out brief interruptions (up to ~2 min of unresponsiveness with these values) and keep NAT/firewalls
from pruning an idle connection. They do **not** survive a real sleep (TCP is gone on wake) — tmux is what
makes sleep a non-event.

## Recovery: `--continue` / `--resume`

If a session died because it wasn't in tmux, reconnect, `cd` to your working directory, and:

```bash
claude --continue     # resume the most recent session in this directory (alias: claude -c)
claude --resume       # pick a session from a list
```

It reloads the transcript with full context. Caveat: it's a fresh process, so it won't resurrect a tool call
that was mid-flight, or a background task that died with the old process — tmux avoids that gap.

## Auth note

Interactive terminal use runs on your Claude subscription via OAuth. If `ANTHROPIC_API_KEY` is set in your
environment, Claude may prompt to choose API key vs. OAuth at startup — unset it for a clean interactive start
(the daemon's start script does the same; see [persistence.md](persistence.md#the-start-script)).

## One-glance recovery after sleep

1. Reopen the laptop → your IDE/SSH client reconnects.
2. Terminal → `tmux attach -t claudex-ide` (or re-run your launcher — it reattaches).
3. You're back in the live session, mid-task. Done.
