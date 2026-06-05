# Hooks Guide — Claudex

How Claude Code hooks work, the reusable scripts in `.claude/hooks/`, and the
exact `settings.json` wiring. Hooks are shell commands the **harness** runs at
fixed points in the agent lifecycle — they are not model decisions. They fire
deterministically, every time, regardless of what the model "feels like" doing.

Paths assume the workspace root `$HOME/.claude-agent`. Settings live at
`.claude/settings.json`; hook scripts live at `.claude/hooks/*.sh`.

---

## 1. What hooks are

A hook is a command wired into `settings.json` under `"hooks"`, keyed by **event
type**, optionally filtered by a `matcher` (a regex on the tool name; `""` = all
tools / not tool-scoped). The harness invokes the command at the event, passing a
**JSON payload on stdin** and capturing stdout/stderr/exit code.

### Event types

- **SessionStart** — a session begins (fresh start or resume). Used to load
  context, set state, warm caches.
- **UserPromptSubmit** — the user submits a prompt, before the model sees it. Can
  inject extra context.
- **PreToolUse** — before a tool runs. Can inspect/gate the call (a non-zero exit
  with the right config can block — we never do this here).
- **PostToolUse** — after a tool returns. The payload includes `tool_name`,
  `tool_input`, and `tool_response`. This is where most of our automation hangs.
- **Notification** — the harness emits a notification (e.g. permission needed).
- **Stop** — the main agent finishes responding / the session ends. Used for
  cleanup, snapshots, shutdown.
- **SubagentStop** — a spawned subagent finishes.
- **PreCompact** — before the transcript is compacted. Useful to persist state
  that compaction would otherwise blur.

### stdin JSON contract

Every hook receives one JSON object on stdin. Common fields:

- `session_id`, `transcript_path`, `cwd` — present on essentially all events.
- `hook_event_name` — the event that fired (e.g. `"PostToolUse"`).
- `tool_name` — the tool, on `PreToolUse` / `PostToolUse` (e.g. `"Write"`).
- `tool_input` — the tool's arguments. For Write/Edit, `tool_input.file_path`
  holds the target path.
- `tool_response` — the result, on `PostToolUse`. May be a **string** or an
  **object**; an error surfaces as `error` / `is_error` / `isError`, or an
  `errorText` / `stderr` / `message` field.

A hook that doesn't care about the payload can ignore stdin. A hook that does
should read it once (`payload="$(cat)"`) and parse with `jq`, falling back to
`python3` (both are assumed present, but degrade gracefully if not).

---

## 2. Reusable scripts in `.claude/hooks/`

Each script is self-contained, reads stdin where relevant, swallows its own
errors, and **always exits 0**. The header comment in each file also carries its
wiring snippet.

### `auto-git-add.sh` — event: **PostToolUse** (matcher `Write|Edit`)

Stages every change after any file write/edit, so the working tree is always
ready to commit. `cd`s to the git toplevel (falls back to cwd when not in a
repo), runs `git add -A`, swallows all errors. Replaces the git-add command that
used to be inlined in `settings.json`.

Wire it:

```json
"PostToolUse": [
  {
    "matcher": "Write|Edit",
    "hooks": [
      { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/auto-git-add.sh" }
    ]
  }
]
```

### `snapshot-on-stop.sh` — event: **Stop**

Writes a tiny resume snapshot to `data/last-session-snapshot.json` so a fresh
session can pick up where this one left off. Captures `{ ts, cwd, git_branch,
latest_daily_note }`. Pulls `cwd` from the stdin payload (falls back to `$PWD`),
reads the current git branch if inside a repo, and finds the newest
`memory/YYYY-MM-DD.md` daily note. Emits valid JSON via `python3` (jq fallback).

Wire it as a **second** hook under the Stop matcher (alongside
`session-shutdown.sh`):

```json
"Stop": [
  {
    "matcher": "",
    "hooks": [
      { "type": "command", "command": "bash $HOME/.claude-agent/scripts/session-shutdown.sh" },
      { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/snapshot-on-stop.sh" }
    ]
  }
]
```

### `lint-on-write.sh` — event: **PostToolUse** (matcher `Write|Edit`) — *optional, not wired by default*

Fast syntax check on the file just written. Reads `tool_input.file_path` from
stdin, picks a linter by extension, prints a `WARNING` to stderr on failure,
skips silently for unknown types or missing linters:

- `*.sh` → `shellcheck -S warning`
- `*.js` / `*.cjs` / `*.mjs` → `node --check`
- `*.py` → `python3 -m py_compile`
- `*.json` → `jq .`

Never blocks; warnings are advisory only. To enable, add it as a second hook
under the existing `Write|Edit` matcher (next to `auto-git-add.sh`):

```json
{ "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/lint-on-write.sh" }
```

### `notify-on-error.sh` — event: **PostToolUse** (matcher `""`) — *optional, not wired by default*

Pushes an `ntfy` alert when a tool call returns an error. No-op unless
`NTFY_TOPIC` is set (and `curl` is available). Reads the payload, detects an
error in `tool_response` (object flags or string keywords), and sends one terse
line via `curl` to `${NTFY_URL:-https://ntfy.sh}/${NTFY_TOPIC}`. Quiet exit when
no error is detected. To enable, add a separate all-tools matcher block:

```json
{
  "matcher": "",
  "hooks": [
    { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/notify-on-error.sh" }
  ]
}
```

---

## 2b. Self-improvement hooks

These four make the agent's *learning* deterministic — they fire on hooks, not "if
the model remembers." They are observe-only / advisory and always exit 0. All model
calls shell out to the `claude` CLI on the **Max OAuth subscription** (ANTHROPIC_API_KEY
stripped) → **zero metered API cost**.

### `memory-curate.cjs` (+ `memory-curate.sh`) — event: **Stop**

After a session ends, a cheap Haiku-tier reflection reads the transcript tail and
extracts **only durable facts** (preferences, environment, corrections, conventions,
milestones) as JSON. Each fact routes deterministically: all → the dated daily note;
user-facts → the structured `memory/USER.md` profile. Append-only, deduped (against
existing memory before writing), size-capped, and it **never touches the hand-written
`CLAUDE.md`**. `memory-curate.sh` is the thin Stop-hook wrapper (throttled) that calls
the `.cjs`. The profile uses a fixed 5-section schema under a ~500-token cap with
poisoning guards (evidence-required, provenance, contradiction→`recent_corrections`
instead of overwrite). Loaded next session by `session-init.sh`; reviewed via `/whoami`.

Wire it as a **second** Stop hook (next to `session-shutdown.sh`):

```json
{ "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/memory-curate.sh" }
```

### `self-edit-gate.sh` — event: **PostToolUse** (matcher `Write|Edit`)

When the agent edits one of its **own** `.claude/skills/*/SKILL.md` files, this runs
`skill-audit.sh` + a secret scan and **warns** (advisory; never blocks, never reverts)
if the edit breaks frontmatter, exceeds 15 KB, or contains a secret-shaped value. Lets
the agent patch its skills freely with a safety net. No-op for any other path.

```json
{ "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/self-edit-gate.sh", "timeout": 20 }
```

### `skill-usage-log.sh` — event: **PostToolUse** (matcher `Skill`)

On each Skill-tool invocation, appends one JSONL line `{skill, ts, session}` to
`data/skill-usage.jsonl` — the data foundation for catalog curation. Reads the skill
name from `tool_input.skill`. `scripts/skill-usage-backfill.sh` seeds it from historical
transcripts. (Captures *explicit* Skill-tool loads, not description-match auto-loads.)

```json
"PostToolUse": [
  {
    "matcher": "Skill",
    "hooks": [
      { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/skill-usage-log.sh", "timeout": 10 }
    ]
  }
]
```

---

## 3. Wired state

This is the live `settings.json` `"hooks"` block, including the self-improvement
hooks from §2b. The inline git-add command is **replaced** by `auto-git-add.sh`;
`self-edit-gate.sh` rides the same `Write|Edit` matcher; a new `Skill` matcher runs
`skill-usage-log.sh`; the Stop event runs shutdown + snapshot + memory-curate.
`lint-on-write.sh` and `notify-on-error.sh` are documented above but **not** wired
by default.

```json
"hooks": {
  "SessionStart": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "bash $HOME/.claude-agent/scripts/session-init.sh" }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/auto-git-add.sh" },
        { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/self-edit-gate.sh", "timeout": 20 }
      ]
    },
    {
      "matcher": "Skill",
      "hooks": [
        { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/skill-usage-log.sh", "timeout": 10 }
      ]
    }
  ],
  "Stop": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "bash $HOME/.claude-agent/scripts/session-shutdown.sh" },
        { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/snapshot-on-stop.sh" },
        { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/memory-curate.sh" }
      ]
    }
  ]
}
```

Summary of the wired flow:

- **SessionStart** → `scripts/session-init.sh` (load context + `USER.md` profile at start).
- **PostToolUse `Write|Edit`** → `auto-git-add.sh` (stage edits), then `self-edit-gate.sh` (audit self-edited skills).
- **PostToolUse `Skill`** → `skill-usage-log.sh` (record skill usage).
- **Stop** → `session-shutdown.sh`, `snapshot-on-stop.sh`, then `memory-curate.sh` (reflect-and-persist).

---

## 4. Safety rules

Hooks run on every matching event, in the harness's critical path. A bad hook
degrades or hangs every turn. Follow these without exception:

- **Always `exit 0`.** A non-zero exit on `PreToolUse` can block the tool call;
  on other events it surfaces noise. Our hooks observe, they don't gate.
- **Never block.** Don't gate the agent on a hook. Lint/notify are advisory only
  (warnings to stderr, fire-and-forget pushes).
- **Use `|| true` (and `2>/dev/null`).** Every fallible command swallows its own
  errors. One failed `git add` or absent linter must not fail the hook.
- **Keep it fast.** Hooks run synchronously and add to every turn's latency.
  Bail early when there's nothing to do (e.g. `notify-on-error.sh` exits before
  any work if `NTFY_TOPIC` is unset). No network calls in the hot path unless
  fire-and-forget.
- **Degrade gracefully.** Probe for tools (`command -v jq`), provide a fallback
  (`python3`), and skip silently when neither is available. Never assume a
  binary exists.
- **Read stdin at most once.** `payload="$(cat)"` then parse the string; don't
  re-`cat` (stdin is consumed).
- **No secrets in hooks.** Hooks run unattended and their output can land in
  logs; never echo tokens or the contents of `.env`.
