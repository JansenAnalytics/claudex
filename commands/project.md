---
description: Switch focus to a project and summarize its live state — branch, changes, recent commits, next steps
allowed-tools: Bash, Read
argument-hint: [name]
---

Switch focus to a project (`$ARGUMENTS`) and report its live state. No fluff.

PI="node ${PROJECT_INDEX_HOME:-$HOME/projects/project-index}/index.cjs"

1. **No arg** — run `$PI list` (fallback `ls ~/projects` if it errors). Present active projects as a bullet list: name, status, one-line last_action. Stop here; tell the user to pass a name for detail.

2. **`<name>` given** — gather registry + LIVE state:
   - `$PI show <name>` → pull `status`, `last_action`, `next_steps`.
   - If not in index, fall back to `~/projects/<name>` as the path.
   - `cd` into the project path, then in ONE shell run: `git rev-parse --abbrev-ref HEAD` (branch), `git status --porcelain | wc -l` (uncommitted count), `git log -5 --oneline` (recent commits). If not a git repo, say so and skip git.
   - If `CLAUDE.md` or `DESIGN.md` exists at the path, Read it and surface a 1–2 line gist (what it is / current focus).

3. **Telegram summary** for the named project, bullets only:
   - **{name}** — status, path
   - **Branch:** `<branch>` · **Uncommitted:** N file(s)
   - **Recent:** the 5 `git log` lines as `code`
   - **Last action:** from registry
   - 1–2 line gist from CLAUDE.md/DESIGN.md if found
   - End with `**Next:** <first next_step>` (or "no next_steps recorded").

Known projects for fallback paths: prop-hedge-agents (`~/projects/prop-hedge-agents`, branch `feature/agent-restructure`), prop-hedge-dashboard, brewboard (STOPPED — note it, don't start), plus any other repo under `~/projects/<name>`. No markdown tables.
