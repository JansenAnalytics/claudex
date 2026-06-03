# Claudex Slash Commands — Guide

Reference for Claudex's custom Claude Code slash commands. 12 commands, grouped by purpose. Accurate to the files on disk under `.claude/commands/`.

## How Claude Code commands work

- **Where they live:** `$HOME/.claude-agent/.claude/commands/<name>.md`. The filename (minus `.md`) is the command name, so `restart.md` → `/restart`. Claude Code auto-loads everything in that directory at session start.
- **File format:** YAML frontmatter + a Markdown body.
  - `description:` (required) — one line; shown in the command list.
  - `allowed-tools:` — comma-separated tool whitelist for the command, e.g. `Bash, Read` or `Bash, Read, Write, Edit`. The command can only use what's listed.
  - `argument-hint:` (optional) — shows the expected args in the picker, e.g. `<query>` or `[reason]`. `<...>` = required, `[...]` = optional.
- **Body = the prompt.** The Markdown body below the frontmatter is the prompt sent to the model. House style: terse, numbered steps, no fluff, Telegram-friendly output (bullets, **bold**, `code`, NO markdown tables).
- **Arguments:** the user's argument text is injected as `$ARGUMENTS` (the whole string) and `$1`, `$2`, ... (positional words). A command with no `$ARGUMENTS` in its body just ignores any args passed.

### Naming & collision

Claude Code ships several built-in commands already — **`/code-review`, `/review`, `/run`, `/verify`** (and others like `/init`, `/security-review`). We do **not** duplicate those. Our 12 commands use distinct names that don't clash with built-ins. If you ever need a custom command whose natural name collides with a built-in, **namespace it with a `cx-` prefix** (e.g. `cx-run`) rather than shadowing the built-in. No collision → no prefix.

### Writing a new command

1. Create `$HOME/.claude-agent/.claude/commands/<name>.md`. Pick a name that doesn't collide with a Claude Code built-in (else `cx-<name>`).
2. Frontmatter: required `description:` (one line), `allowed-tools:` scoped to the minimum the command needs, optional `argument-hint:` if it takes args.
3. Body: numbered steps, terse, no preamble. Reference `$ARGUMENTS` / `$1` where the user's input belongs. Use absolute or `~`-rooted paths to the real scripts in `~/.claude-agent/scripts/`.
4. Output contract: Telegram-friendly (bullets, **bold**, `code`), no markdown tables, lead with a one-line verdict where it fits, end with action items / a resume point if relevant. Don't pad, don't congratulate.
5. No new file needed for Claude Code to pick it up — it auto-loads on the next session. Test by running `/<name>`.

---

## Self / Session

Commands that operate on Claudex itself — its health, memory, context, and lifecycle.

### /audit
- **Does:** Composite health audit of Claudex's own state — system health (tmux/systemd/process, disk/memory, watchdog log), memory & RAG index stats, and skill catalog. Three sections, each led by a ✅/⚠️/❌ verdict, ending with concrete action items.
- **argument-hint:** none
- **allowed-tools:** `Bash, Read`
- **Usage:** `/audit`

### /context
- **Does:** Dumps current working context for a handoff or review — today's + yesterday's daily memory, active tasks (grouped by status), pending inbox, recent plans (last 7 days), recent decisions/learnings from RAG, and cross-agent flags mentioning Claudex. Ends with a one-sentence **Resume point**.
- **argument-hint:** none
- **allowed-tools:** `Bash, Read`
- **Usage:** `/context`

### /recap
- **Does:** Terse "Done / In-flight / Next" recap of recent activity over a time window, pulling from daily notes, the event log, Claudex's own session transcript, and recent git commits across projects. Each source is optional — missing ones are skipped silently.
- **argument-hint:** `[today|24h|7d]` (default `today`; `Nd` = last N days)
- **allowed-tools:** `Bash, Read`
- **Usage:** `/recap 7d`

### /remember
- **Does:** Frictionless single-fact capture. Appends `- HH:MM — <fact>` under a `## Quick notes` section in today's daily note (append-only, never overwrites). If the fact is lasting (preference/feedback/project/reference), also persists it to cross-session auto-memory with type-prefixed frontmatter and a `MEMORY.md` pointer. Confirms via Telegram.
- **argument-hint:** `<text>`
- **allowed-tools:** `Bash, Read, Write, Edit`
- **Usage:** `/remember the user prefers FX recaps before market open`

### /handoff
- **Does:** End-of-day handoff. Gathers what happened today (completed tasks, decisions, problems/solutions, in-flight carry-overs, notable edits/PRs/deploys), writes/merges it into today's daily memory file under Done / Decisions / Carry-over / Notes, then sends a Telegram day-summary with a resume point. Merges rather than duplicating if the file exists.
- **argument-hint:** none
- **allowed-tools:** `Bash, Read, Write, Edit`
- **Usage:** `/handoff`

### /rag
- **Does:** Semantic memory/RAG search across memories, session transcripts, and cross-agent context via `memory-search.cjs` (needs `OPENAI_API_KEY` for embeddings). Retries without filters on zero hits, suggests a reindex if still empty, presents top hits with source tag + score + snippet + `file:line` ref, and offers to drill into one.
- **argument-hint:** `<query>`
- **allowed-tools:** `Bash, Read`
- **Usage:** `/rag prop-hedge conference timing`

### /briefing
- **Does:** Runs the `morning-briefing` skill explicitly and sends the result as one Telegram message — weather (Oslo), market overview (FX, key indices), system health (disk/memory/services), upcoming scheduled tasks, plus a recent-memory line if worth surfacing. Leads with the date, under 15 lines, empty sections omitted.
- **argument-hint:** none
- **allowed-tools:** `Bash, Read`
- **Usage:** `/briefing`

### /skill
- **Does:** Force-invokes a specific skill by name, bypassing description-based auto-selection. Verifies the skill exists (suggests closest matches if not), reads its `SKILL.md` in full, then executes it with the remaining argument as the request. Useful when auto-select picked wrong, when testing a skill, or for brevity.
- **argument-hint:** `<skill-name> [args...]`
- **allowed-tools:** `Bash, Read`
- **Usage:** `/skill weather Oslo`

### /restart
- **Does:** Graceful restart of the Claudex tmux session with the reason logged to `watchdog.log`. Warns + asks for confirmation if mid-task, saves in-flight state via `session-shutdown.sh`, sends a self-contained pre-restart Telegram message, then triggers `restart-claudex.sh` (falls back to killing tmux for the watchdog cron to respawn).
- **argument-hint:** `[reason]` (default `"manual restart via /restart"`)
- **allowed-tools:** `Bash`
- **Usage:** `/restart applied new skill config`

## Project & Dev

Commands for working on projects and shipping code.

### /project
- **Does:** Switches focus to a project and reports its live state. No arg → lists active projects from the project-index (fallback `ls ~/projects`). With a name → pulls registry status/last_action/next_steps plus live git state (branch, uncommitted count, last 5 commits) and a 1–2 line gist from CLAUDE.md/DESIGN.md. Ends with the first next step.
- **argument-hint:** `[name]`
- **allowed-tools:** `Bash, Read`
- **Usage:** `/project prop-hedge-agents`

### /ship
- **Does:** Commits and pushes current work with guardrails — repo check, change check, secret scan (aborts on `.env`/key/token-like content), branch guard (never commits straight to main/master — creates a `feat/<slug>` branch first), conventional-commit message with the required `Co-Authored-By` trailer, then `git push -u origin HEAD`. Reports branch/commit/files/push status and offers (never auto-opens) a PR.
- **argument-hint:** `[message]` (optional commit subject; auto-generated from the diff if omitted)
- **allowed-tools:** `Bash, Read`
- **Usage:** `/ship fix: correct conference timeout`

## Ops

Infrastructure and scheduled-job monitoring.

### /cron
- **Does:** Scheduled-jobs dashboard. Runs `cron-dash` (status/health/errors/next 12) — falling back to the cron-dashboard skill script — then summarizes as one Telegram message: scheduled job counts, failures/stale logs/errors, upcoming runs. Explicitly confirms the watchdog cron (every 5 min) is present and not stale. Action items only if something's broken.
- **argument-hint:** none
- **allowed-tools:** `Bash, Read`
- **Usage:** `/cron`

---

## Quick index

- **Self/session:** `/audit` · `/context` · `/recap [window]` · `/remember <text>` · `/handoff` · `/rag <query>` · `/briefing` · `/skill <name> [args]` · `/restart [reason]`
- **Project & dev:** `/project [name]` · `/ship [message]`
- **Ops:** `/cron`

All commands output Telegram-friendly text (bullets, **bold**, `code`, no markdown tables). Files: `$HOME/.claude-agent/.claude/commands/`.
