# Skills Guide

Skills are the primary way to extend what Claude Code knows how to do. Each skill is a focused instruction set that teaches the agent how to handle a specific domain — from fetching weather to running CI pipelines to trading conferences.

---

## What Skills Are

A skill is a **modular instruction file** that gets loaded into Claude Code's context when relevant. Instead of one monolithic system prompt that covers everything, skills let you compose targeted knowledge on demand.

Think of skills as **domain experts you can summon**. The `github-workflow` skill knows your repos, your branch conventions, and every `gh` command worth knowing. The `watchdog` skill knows how to check disk, memory, services, and logs. When you ask about git, the github skill loads. When you ask about system health, watchdog loads. Neither pollutes the other.

Skills stay modular, stay focused, and stay small — making them easy to maintain, easy to share, and easy to port.

---

## Skill Format

Every skill is a single `SKILL.md` file with a YAML frontmatter block followed by markdown instructions:

```markdown
---
name: skill-name
description: When to use this skill — what triggers it, what tasks it covers.
---

# Skill Title

Instructions, commands, context, rules...
```

### Frontmatter Fields (v2 schema)

**Required:**

| Field | Purpose |
|---|---|
| `name` | Unique identifier for the skill (must match the directory name) |
| `description` | Trigger description — used for auto-selection (see below). Pack with synonyms. |

**Recommended (becomes required in Phase 3):**

| Field | Purpose |
|---|---|
| `category` | One of the 15 controlled categories (see `docs/skill-anatomy.md`) |
| `maturity` | One of: `experimental`, `beta`, `stable`, `deprecated` |

**Optional:**

| Field | Purpose |
|---|---|
| `tags` | Inline array of free-form tags for finer search: `[git, github, ci]` |
| `external_deps` | Array of external project names this skill depends on. Triggers `INSTALL.md` requirement. |

Full schema reference: [`docs/skill-anatomy.md`](skill-anatomy.md).

The body is plain markdown. You can use headers, bullet lists, code blocks, tables — whatever communicates the skill best.

---

## Auto-Selection

Claude Code reads all skill `description` fields at startup and **automatically loads skills that match the user's request**. This is the core mechanic.

When you ask: *"Check if the CI passed on my last PR"* — Claude Code scans skill descriptions, finds that `github-workflow` says *"Git and GitHub operations — clone, branch, commit, push, PRs, issues, CI status"*, matches `CI status`, and loads the skill into context.

**The `description` field is your trigger.** It's not a summary for humans — it's a matching surface for the agent. Write it with trigger words in mind.

Good description:
```
Git and GitHub operations — clone, branch, commit, push, PRs, issues, CI status. Use for any git or GitHub task.
```

Weak description:
```
Helps with git stuff.
```

The good version has 10+ trigger terms. The weak version has 2.

---

## Directory Structure

Skills live under `.claude/skills/` in your project or workspace. Each skill gets its own directory. **The skills root is flat — never nest categories as subdirectories.** Claude Code's skill auto-loader expects `skills/<name>/SKILL.md` and breaks on deeper nesting. Categorization is metadata-only via the `category:` frontmatter field.

### Minimal skill

```
.claude/skills/
├── weather/
│   └── SKILL.md
├── github-workflow/
│   └── SKILL.md
└── watchdog/
    └── SKILL.md
```

### Full anatomy (v2)

```
.claude/skills/<name>/
├── SKILL.md         REQUIRED — the skill
├── scripts/         OPTIONAL — bash/python/node scripts the skill executes
├── references/      OPTIONAL — reference data, schemas, fixtures
├── assets/          OPTIONAL — templates, prompts, static files
├── data/            OPTIONAL — small bundled data
├── tests/           OPTIONAL — smoke tests for the skill itself
└── INSTALL.md       OPTIONAL — required if external_deps is non-empty
```

The directory name must match the `name` field. This makes skills easy to find, enable, disable (by removing the directory), and version-control.

Bundled support files (`scripts/`, `references/`, etc.) are referenced from `SKILL.md` via the `$CLAUDE_SKILLS_DIR` convention — see Path Conventions below.

---

## Path Conventions

External path references in `SKILL.md` bodies are a portability bug. The audit script (`scripts/skill-audit.sh`) flags them.

### `$CLAUDE_SKILLS_DIR` for own-directory references

For skills that have their own `scripts/` or `references/` subdir, refer to them via:

```bash
SKILL_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/<skill-name>"
$SKILL_DIR/scripts/do-the-thing.sh
```

- `$CLAUDE_SKILLS_DIR` is set in `settings.json` env block and propagates to all bash tool calls.
- The `:-default` fallback keeps the skill working if the env var isn't set (e.g. fresh clone).
- Use the literal skill name, not a derived value — bash heredocs in SKILL.md bodies don't have `$0` set usefully.

### Per-project env vars for external dependencies

For skills that wrap a standalone project (e.g. `task-queue`), use a per-project env var with a sensible default:

```bash
TASK_QUEUE_HOME="${TASK_QUEUE_HOME:-$HOME/projects/task-queue}"
node "$TASK_QUEUE_HOME/cli.cjs" --add "..."
```

Document the env var and its default in `INSTALL.md` for that skill.

### Never hardcode `/home/<user>/...`

That path is meaningless on any machine that isn't yours. The audit script catches these.

---

## Migrating an existing skill to v2

For each pre-v2 skill (no `category`, no `maturity`, possibly hardcoded paths):

1. **Pick a category** from the 15 in `docs/skill-anatomy.md`.
2. **Pick a maturity** — be honest. Bugs you know about → `beta`. Hasn't broken in months → `stable`. Half-finished → `experimental`. Slated for removal → `deprecated`.
3. **Add `tags`** — 3–6 free-form tags beyond what the name conveys.
4. **Fix hardcoded paths:**
   - Skill-shaped support (small, purpose-built scripts) → vendor into `scripts/<skill-name>/scripts/` and reference via `$CLAUDE_SKILLS_DIR`.
   - Standalone-project deps → use a per-project env var with default, document in `INSTALL.md`.
5. **Add `external_deps`** if the skill needs an external project.
6. **Create `INSTALL.md`** if `external_deps` is non-empty or hardcoded paths can't be removed.
7. **Validate:**
   ```bash
   bash scripts/skill-audit.sh --skill <name>
   ```
   Should report 0 warnings, 0 errors.

---

---

## Writing Good Skills

### Keep descriptions trigger-word-rich

The description is scanned for semantic matches. Pack in synonyms, task names, and domain terms. If users might ask for it six different ways, all six should be hintable from your description.

### Include actual commands

Claude Code executes commands. Don't just describe what to do — show it:

```bash
# Good: agent can copy and run this
gh pr create --title "feat: add dark mode" --body "Closes #42"

# Weak: agent has to invent the command
# Use gh CLI to create PRs
```

Executable examples are the most valuable part of a skill. They eliminate guesswork and prevent hallucinated syntax.

### Stay focused on one domain

A skill that covers git + docker + deployment + monitoring is hard to maintain and wastes context space. Split domains into separate skills. The agent will load multiple skills in a single turn if the request warrants it.

### Include troubleshooting and edge cases

What happens when authentication fails? What's the recovery path when a service won't start? What's the flag to force-push safely? Anticipate the failure modes and document them. A skill that only covers happy paths will leave the agent stranded on the first error.

### Use bash code blocks for commands

Always wrap shell commands in ` ```bash ` blocks — not inline code, not prose. Claude Code treats fenced bash blocks as directly executable. This matters for multi-line commands, piped chains, and conditional logic.

---

## Porting from OpenClaw

OpenClaw and Claude Code use the **same SKILL.md format** — same YAML frontmatter, same markdown body. Most OpenClaw skills port directly with minimal changes.

### Key differences

**Supporting files:** OpenClaw skills often reference `scripts/` and `references/` subdirectories alongside `SKILL.md`. Claude Code can also read these — just make sure paths in the skill body are relative and correct.

**Injection mechanism:** OpenClaw injects skills via `<available_skills>` XML in the system prompt. Claude Code uses description matching to auto-load. The end result is the same; the mechanism differs. You don't need to change anything in the skill itself.

**OpenClaw-specific tools:** Some OpenClaw skills reference tools that don't exist in Claude Code:
- `browser` — web browser control
- `canvas` — visual canvas rendering
- `nodes` — paired device control
- `message` — send Telegram/Discord messages

When porting these skills, replace OpenClaw tool calls with shell-based equivalents (curl, playwright-cli, etc.) or note the limitation in the skill body.

**Practical approach:** Copy `SKILL.md` verbatim. Run through it once and flag any tool references that won't work. Most research, development, and system skills port with zero changes. UI-heavy or notification-heavy skills need the most adaptation.

---

## Skill Categories

This repo ships **160 skills** across the 15 controlled categories. Rather than duplicate the full list here (and let it drift), see the **auto-generated, always-current catalog**:

➡️ **[`docs/skills-catalog.md`](skills-catalog.md)** — every skill grouped by category, with its maturity, description, and tags.

Regenerate it any time the skill set changes with `bash scripts/skill-index.sh`.

---

## Complete Skill Examples

### Example 1: `weather`

```markdown
---
name: weather
description: Get current weather and forecasts. Use when the user asks about weather, temperature, or forecasts for any location.
---

# Weather Skill

Fetch weather using wttr.in:

\`\`\`bash
# Current weather (concise)
curl -s "wttr.in/LOCATION?format=%l:+%c+%t+%h+%w"

# 3-day forecast
curl -s "wttr.in/LOCATION?format=v2"

# JSON for parsing
curl -s "wttr.in/LOCATION?format=j1"
\`\`\`

Default location: **Oslo** (the user's location)

Format the response naturally — don't dump raw output.
```

---

### Example 2: `github-workflow`

```markdown
---
name: github-workflow
description: Git and GitHub operations — clone, branch, commit, push, PRs, issues, CI status. Use for any git or GitHub task.
---

# GitHub Workflow

## Tools
- **gh CLI**: `~/.local/bin/gh` — authenticated as JansenAnalytics
- **git**: Standard git commands

## Rules
- Feature branches always. Never push to main directly.
- `fixes #N` in commits auto-closes issues. `refs #N` does not.
- Use conventional commit messages when appropriate.

## Common Commands
\`\`\`bash
# PR operations
gh pr create --title "..." --body "..."
gh pr list
gh pr status
gh pr merge <number>

# Issues
gh issue create --title "..." --body "..."
gh issue list --label "bug"

# CI/Actions
gh run list
gh run view <id> --log-failed

# Repo
gh repo create JansenAnalytics/<name> --private
gh repo clone JansenAnalytics/<name>
\`\`\`

## Key Repos
- `prop-hedge-agents` — Trading system (branch: feature/agent-restructure)
- `prop-hedge-dashboard` — Dashboard (branch: master)
- `brewboard` — BCH analytics (branch: feature/frontend-polish)
```

---

### Example 3: `watchdog`

```markdown
---
name: watchdog
description: Monitor system health — check services, disk usage, processes, logs. Use when asked about system status or health.
---

# System Health Watchdog

## Quick Health Check
\`\`\`bash
# Disk usage
df -h / /home | tail -2

# Memory
free -h

# CPU load
uptime

# Running services
systemctl --user list-units --state=running --no-pager | head -20

# Check specific services
systemctl --user status openclaw-poe-gateway openclaw-argus-gateway 2>&1 | grep -E "●|Active:"

# Large files
dust -n 10 $HOME

# Network connectivity
curl -s -o /dev/null -w "%{http_code}" https://api.telegram.org
\`\`\`

## Process Monitoring
\`\`\`bash
# Check if a process is running
pgrep -fa "PROCESS_NAME"

# Top CPU consumers
ps aux --sort=-%cpu | head -10

# Top memory consumers
ps aux --sort=-%mem | head -10
\`\`\`

## Log Checking
\`\`\`bash
# Recent system errors
journalctl --user --since "1 hour ago" --priority err --no-pager | tail -20

# Check specific log
tail -50 /path/to/logfile | grep -i "error\|fail\|crash"
\`\`\`

## Key Services to Monitor
- openclaw main gateway (systemd)
- openclaw-poe-gateway (systemd user)
- openclaw-argus-gateway (systemd user)
- Claude Code session (this instance)
```

---

## Quick Reference

| Task | What to do |
|---|---|
| Add a skill | Create `.claude/skills/<name>/SKILL.md` |
| Disable a skill | Remove or rename the directory |
| Port from OpenClaw | Copy `SKILL.md`, check for OpenClaw-specific tools |
| Improve trigger matching | Add more synonyms to `description` |
| Add support files | Put them alongside `SKILL.md` in the skill directory |
| Share a skill | It's a plain markdown file — commit and PR |
