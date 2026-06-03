# Recommended Claude Code Plugins for Claudex

Curated from the official marketplace `claude-plugins-official`
(anthropics, cloned at `~/.claude/plugins/marketplaces/claude-plugins-official/`).
Every name and install command below is verified against the actual marketplace — nothing invented.

Install any of these with:
```
/plugin install <name>@claude-plugins-official
```
Browse the full directory in-session with `/plugin > Discover`.

---

## 1. What plugins are (vs. our skills / commands / agents / hooks)

A **plugin** is a single installable bundle that can ship any combination of the things we already author by hand:

- **commands/** — slash commands (same `.md` format as our `.claude/commands/`)
- **skills/** — `SKILL.md` skills (same as our 162 under `.claude/skills/`)
- **agents/** — subagent definitions (like our researcher / coder / reviewer)
- **hooks** — lifecycle hooks wired via `settings.json`
- **.mcp.json** — MCP server config (tools)
- plus optional LSP servers and output styles

So a plugin is the **distribution wrapper** around exactly the pieces Claudex is built from. Today we hand-place those files in the workspace; a plugin lets you install, version, update, and uninstall a coherent set in one move. Standard layout:

```
plugin-name/
├── .claude-plugin/plugin.json   # metadata (required)
├── .mcp.json                    # MCP servers (optional)
├── commands/  agents/  skills/  # same formats we already use
└── README.md
```

Anthropic-internal plugins live in the marketplace's `/plugins`; partner/community ones in `/external_plugins`. **Trust matters** — a plugin can pull in MCP servers and code Anthropic does not control. Vet before installing.

---

## 2. Plugins that pair well with the Claudex setup

These are the Anthropic-maintained internal plugins whose value props line up with how Claudex actually works (coding, automation, memory, self-audit). All are first-party — lowest trust risk.

- **claude-code-setup** — analyzes a codebase and recommends tailored hooks, skills, MCP servers, and subagents. Good for bootstrapping automation in `~/projects/*`.
  `/plugin install claude-code-setup@claude-plugins-official`
- **plugin-dev** — the toolkit for authoring plugins (skills, commands, hooks, MCP, agents). This is the one to use when packaging Claudex itself — see section 3.
  `/plugin install plugin-dev@claude-plugins-official`
- **skill-creator** — create, improve, eval, and benchmark skills. Complements our own `self-skill` / `skill-creator` skills with variance analysis.
  `/plugin install skill-creator@claude-plugins-official`
- **claude-md-management** — audit CLAUDE.md quality and capture session learnings. Directly useful for our `CLAUDE.md` + `memory/` discipline.
  `/plugin install claude-md-management@claude-plugins-official`
- **hookify** — generate custom hooks from plain-markdown rules to block unwanted behaviors. Pairs with our `.claude/rules/safety.md`.
  `/plugin install hookify@claude-plugins-official`
- **commit-commands** — slash commands for commit / push / PR workflows. Fits our git rules (feature branches, conventional commits).
  `/plugin install commit-commands@claude-plugins-official`
- **code-review** — multi-agent PR review with confidence-based scoring to filter false positives. Complements our `reviewer` subagent.
  `/plugin install code-review@claude-plugins-official`
- **pr-review-toolkit** — review agents specialized by concern (comments, tests, error handling, type design, simplification).
  `/plugin install pr-review-toolkit@claude-plugins-official`
- **code-simplifier** — agent that refines recently-modified code for clarity without changing behavior.
  `/plugin install code-simplifier@claude-plugins-official`
- **feature-dev** — end-to-end feature workflow: codebase exploration, architecture design, quality review. Useful for prop-hedge / dashboard work.
  `/plugin install feature-dev@claude-plugins-official`
- **session-report** — explorable HTML report of session usage (tokens, cache, subagents, skills, costliest prompts) from `~/.claude/projects` transcripts — i.e. **Claudex's own** transcripts. Pairs with our `/audit` and `meta-analyst`.
  `/plugin install session-report@claude-plugins-official`

**Messaging bridges (external)** — same family as the Telegram one we run:
- **discord** — `/plugin install discord@claude-plugins-official`
- **imessage** — `/plugin install imessage@claude-plugins-official`

These are community/partner bridges with their own access control; install only if the user wants those channels.

---

## 3. Authoring your own — and packaging Claudex

**To build a plugin:** install **plugin-dev** and run its `/create-plugin` command. It ships skills for every layer (`plugin-structure`, `command-development`, `skill-development`, `agent-development`, `hook-development`, `mcp-integration`, `plugin-settings`) plus validator/reviewer agents. That is the canonical, supported path — don't hand-roll the structure.

**Packaging Claudex as a plugin (future):** most of Claudex is already plugin-shaped — we have `commands/`, `skills/`, subagents, and `rules/`. To publish:

1. Use **plugin-dev** to scaffold a `claudex` plugin and move/symlink a curated subset of `.claude/commands/` + `.claude/skills/` into it.
2. Add `.claude-plugin/plugin.json` (name, description, version, author).
3. Wire any MCP servers via `.mcp.json` (NOT our Telegram bot token / `ANTHROPIC_API_KEY` — secrets in `.env` never go in a plugin or to git).
4. Validate with plugin-dev's `plugin-validator` agent.
5. Host it as a git repo and expose a marketplace manifest, OR submit to the official directory via the [submission form](https://clau.de/plugin-directory-submission). Note: the workspace may not be a git repo today — `git init` a dedicated plugin repo, don't try to publish the whole `~/.claude-agent`.

Caveat: most Claudex skills assume our absolute paths (`$HOME/.claude-agent/...`) and local scripts. A publishable plugin must be made path-portable first — that's real work, not a copy job.

---

## 4. Currently in use

**Only one plugin is active: `telegram`** (external bridge, v0.0.6) — the messaging channel Claudex talks to the user through, with access managed via `/telegram:access`. Nothing else from the marketplace is installed yet; the section-2 list is the shortlist to pull from.
