# SKILL.md Anatomy (v2)

The formal specification for a Claudex skill. This is the schema that `scripts/skill-audit.sh` validates against and that `scripts/skill-index.sh` consumes.

---

## Directory layout

Every skill lives in its own directory under `.claude/skills/`. The directory name must match the `name` field in the SKILL.md frontmatter.

```
skills/<skill-name>/
├── SKILL.md              REQUIRED — the skill itself
├── scripts/              OPTIONAL — executable support scripts (bash/python/node)
├── references/           OPTIONAL — read-only reference data, schemas, examples, fixtures
├── assets/               OPTIONAL — templates, prompts, static files
├── data/                 OPTIONAL — small bundled data (CSVs, fixtures, etc.)
├── tests/                OPTIONAL — smoke tests for the skill itself
└── INSTALL.md            OPTIONAL — required if the skill has external project deps
```

The skills/ root directory is **flat** — never nest categories as subdirectories. Claude Code's skill auto-loader expects `skills/<name>/SKILL.md` and breaks on deeper nesting. Categorization is metadata-only (see `category` field below).

---

## SKILL.md frontmatter schema

YAML between two `---` delimiters at the very top of the file.

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier. Must match the directory name. Used by the auto-loader. |
| `description` | string | Trigger description — what the skill is for and when to use it. Pack this with synonyms; Claude Code matches against it during reasoning. One sentence, no markdown. |
| `category` | string | One of the 15 controlled categories (see below). **Required as of Phase 3** — `skill-audit.sh` errors on a missing or out-of-list value. |
| `maturity` | string | One of: `experimental`, `beta`, `stable`, `deprecated`. **Required as of Phase 3.** |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `tags` | array of strings | Free-form tags for finer-grained search. Inline array form: `[git, github, ci]`. |
| `external_deps` | array of strings | Names of external projects the skill depends on (e.g. `[task-queue, market-monitor]`). If non-empty, `INSTALL.md` is required. |
| `private` | boolean | If `true`, the skill is excluded from the showcase-repo sync. Skill stays in the workspace and auto-loads normally, but never gets published. See "Private skills" below. |

### Categories (the 15)

A skill gets **exactly one** category — its primary purpose. The controlled list is
the source of truth for `scripts/skill-audit.sh` (which errors on any value not in
this list) and `scripts/skill-index.sh` (which renders the catalog in this order).

| Category | What it covers |
|----------|---------------|
| `development` | Generic dev workflows — git, ci-cd, code review, test runner, refactoring, scaffolding, releases, dependency audits, arch diagrams |
| `frontend` | UI work — React, CSS, accessibility, responsive checking, visual/design review, e2e/flow testing |
| `backend` | APIs, databases (as infrastructure), schema, mocking, perf profiling |
| `security` | Security audits, vuln scanning, secret management, host hardening, password managers |
| `research` | Web/deep research, monitoring, RSS, doc reading/verification, summarization, hypothesis testing |
| `data` | ETL, SQL-for-analytics, validation, visualization, seed data, data analysis |
| `system` | OS admin, watchdog, backup, docker, systemd, networking, logs, error monitoring, file management |
| `comms` | Messaging — Slack, Discord, email, push notifications, iMessage/SMS/WhatsApp, voice |
| `writing` | Documentation, knowledge bases/graphs, ADRs, drafts, prompt libraries |
| `productivity` | Calendars, notes, reminders, task queues, scheduling, clipboards, project planning/indexing, Google Workspace |
| `media` | Image/video/audio — generation, transcription, TTS, OCR, screenshots, PDF editing |
| `trading-finance` | Markets, technical/fundamental/sentiment analysis, economic data, ordering/commerce, prop trading |
| `home-iot` | Smart home & local devices — Hue, Sonos, Spotify, Eight Sleep, weather, places lookup |
| `meta` | Self-tooling — skill-creator, skill-index, model-router/usage, MCP hubs, LLM CLIs, cost-optimizer |
| `legal-tech` | Legal & compliance tooling — contract analysis, document review, regulatory checks |

> **Note:** `legal-tech` was split out of `trading-finance` in Phase 3. Due-diligence and
> contract-analysis skills belong in `legal-tech`, not `trading-finance`.

### Maturity values

| Value | Meaning |
|-------|---------|
| `experimental` | Half-baked. Expect breakage. Here as a sketch. |
| `beta` | Works but rough — API may shift, edge cases lurking. |
| `stable` | Production-quality. Safe to depend on. |
| `deprecated` | Slated for removal. Don't use for new work. Migration path documented in body. |

### Example

```yaml
---
name: github-workflow
description: Git and GitHub operations — clone, branch, commit, push, PRs, issues, CI status. Use for any git or GitHub task.
category: development
tags: [git, github, ci, pr, issues]
maturity: stable
external_deps: []
---
```

---

## SKILL.md body conventions

After the frontmatter, the body is plain markdown. Recommended structure:

```markdown
# Skill Title

Short paragraph: what this skill is for, when the agent should use it.

## When to use
- Concrete triggers, beyond what the frontmatter description covers
- Edge cases the auto-loader might miss

## Setup (optional)
Pre-conditions, env vars, required tools.

## Usage
Executable commands wrapped in bash code blocks. Include real examples.

\```bash
# Show, don't tell. The agent will copy-paste these.
SKILL_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/<skill-name>"
$SKILL_DIR/scripts/do-the-thing.sh --flag value
\```

## Troubleshooting
What can go wrong, how to detect, how to fix.

## Rules
Hard constraints — what NEVER to do with this skill.
```

### Body rules

- **Wrap commands in `bash` code blocks**, not inline backticks. Claude Code treats fenced bash blocks as directly executable.
- **Show real commands**, not pseudocode. Agents don't fill in placeholders well.
- **Document failure modes**. A skill that only covers the happy path leaves the agent stranded on first error.
- **Keep it under 5 KB.** The audit script warns above that — long skills should split into related skills.
- **No reference to the current task/PR.** Skills live across many tasks; references rot.
- **No emoji unless the user asked for emoji.**

---

## Path conventions

External path references in SKILL.md bodies are a portability bug. The audit script flags them.

### Use the `$CLAUDE_SKILLS_DIR` convention

For skills that have their own `scripts/` or `references/` subdir, refer to them via:

```bash
SKILL_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/<skill-name>"
```

- `$CLAUDE_SKILLS_DIR` is injected by the SessionStart hook (see `scripts/session-init.sh`).
- The `:-default` fallback keeps the skill working in environments without the env var set.
- `<skill-name>` is the literal skill name (matches the directory). Don't try to derive it dynamically — bash heredocs won't have `$0` set usefully.

### Use environment variables for external project deps

For skills that wrap a standalone project (e.g. `task-queue`), use a per-project env var with a sensible default:

```bash
TASK_QUEUE_HOME="${TASK_QUEUE_HOME:-$HOME/projects/task-queue}"
node "$TASK_QUEUE_HOME/cli.cjs" --add "..."
```

Document the env var and the default in `INSTALL.md`.

### Never hardcode `/home/<user>/...`

That path is meaningless on any machine that isn't yours. The audit script catches these.

---

## When to add `INSTALL.md`

`INSTALL.md` is required if **either**:
- The skill's `external_deps` frontmatter field is non-empty, OR
- The SKILL.md body references paths outside the skill's own directory (other than via established env-var defaults)

### INSTALL.md template

```markdown
# Install: <skill-name>

This skill wraps the standalone <project-name> project (or: requires <tool>).

## Prerequisites
- Node.js 22+ (or whatever the project needs)
- A <foo> account / API key

## Setup
1. Clone: `git clone https://github.com/JansenAnalytics/<project>.git ~/projects/<project>`
2. Install deps: `cd ~/projects/<project> && npm install`
3. (Optional) Set env: `export <PROJECT>_HOME=~/projects/<project>`
4. (Optional) Add to your shell rc so it persists.

## Configuration
- `<PROJECT>_HOME` — root of the project (default: `~/projects/<project>`)
- `<PROJECT>_API_KEY` — API key for X (required for live mode)

## What the skill expects
- `$<PROJECT>_HOME/cli.cjs` — main CLI entrypoint
- `$<PROJECT>_HOME/data/state.json` — auto-created on first use

## Verification
\```bash
node $<PROJECT>_HOME/cli.cjs --version
\```
```

---

## Migrating an existing skill to v2

For each pre-v2 skill (no `category`, no `maturity`, possibly hardcoded paths):

1. **Pick a category** from the list of 15.
2. **Pick a maturity** — be honest. If the skill has bugs you know about, that's `beta`. If you haven't touched it in months and it still works, `stable`. If it's half-finished, `experimental`.
3. **Add `tags`** — 3–6 free-form tags that capture what the skill is about beyond its name.
4. **Fix hardcoded paths** — replace `~/openclaw/skills/X/scripts` with `${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/X/scripts`, OR vendor the scripts into the skill's own directory.
5. **Add `external_deps`** if the skill needs an external project.
6. **Create INSTALL.md** if `external_deps` is non-empty or hardcoded paths can't be removed.
7. **Run `bash scripts/skill-audit.sh --skill <name>`** — should report 0 warnings.

---

## Validation

```bash
# Audit a single skill
bash scripts/skill-audit.sh --skill <name>

# Audit all skills, only show problems
bash scripts/skill-audit.sh --quiet

# Machine-readable
bash scripts/skill-audit.sh --json > /tmp/audit.json

# Exit code 1 means at least one skill has errors (not warnings)
bash scripts/skill-audit.sh --quiet && echo "all clean" || echo "errors present"
```

---

## Private skills

Some skills wrap private projects or contain sensitive context that should NEVER ship in the public showcase repo. These get marked private in two independent ways (defense in depth):

### Marking a skill private

1. Add `private: true` to the SKILL.md frontmatter:

```yaml
---
name: my-private-skill
description: ...
private: true
category: ...
maturity: stable
external_deps: [my-private-project]
---
```

2. Add the skill's directory to `~/.claude-agent/.sync-exclude`:

```
.claude/skills/my-private-skill/
```

### Why both?

- **Frontmatter** is the source of truth — travels with the skill, survives renames, easy to audit (`jq '.[] | select(.private)' skill-audit.json`).
- **`.sync-exclude`** is the safety net — a single regex rule keeps the sync script from publishing anything in that directory even if someone accidentally clears the frontmatter.

The Phase 5 sync script (`scripts/sync-to-repo.sh`) honors both. The check is `private OR in-exclude` (not AND) — either gate excludes from sync.

### Why not a separate `.claude/private-skills/` directory?

Claude Code's auto-loader only scans `.claude/skills/`. Moving a skill to `.claude/private-skills/` would silently disable its auto-loading, so the skill would only ever fire via explicit `/skill <name>` invocation. We tested this and reverted — keeping private skills in the normal `.claude/skills/` directory preserves the auto-loading UX.

### Audit behavior for private skills

- `skill-audit.sh` shows private skills with a 🔒 marker
- External-path warnings are **suppressed** for private skills (they're allowed to reference local-only paths — they never sync publicly)
- The summary reports a separate "Privacy" count
- `external_deps` and INSTALL.md are still encouraged for private skills (so future-you can rebuild the env)

### Private skills

Mark a skill `private: true` in its SKILL.md frontmatter (and/or list it in `.sync-exclude`) to keep it in your local workspace but exclude it from the public sync. Private skills still auto-load locally — they just never ship to the showcase repo.

---

## What this schema is NOT

- **Not a runtime contract.** Claude Code doesn't enforce these fields at load time. The schema is enforced by `skill-audit.sh` and (in Phase 3) by CI.
- **Not a way to disable a skill.** To disable, remove or rename the directory.
- **Not version-controlled per-skill.** A future `version:` field could be added if needed, but for now skills are versioned at the repo level.
- **Not a substitute for the description field.** Categories/tags help humans browse and the meta `skill-index` skill enumerate — they do NOT replace a good description. Description is what the auto-loader matches against.
