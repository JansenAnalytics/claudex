# Changelog

Notable changes to the Claudex reference implementation. This documents a
showcase/reference repo rather than a versioned package, so entries are grouped
by date. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-06-05 — Self-improvement loops (deterministic, zero-marginal-cost)

### Added
- **Memory curation (Stop hook)** — `hooks/memory-curate.{cjs,sh}` reflect over the
  session transcript tail at session end and persist *only durable facts* (preferences,
  environment, corrections, conventions, milestones) to the dated daily note and the
  structured `USER.md` profile. Append-only, deduped, size-capped; shells out to the
  `claude` CLI on the Max subscription (zero metered API cost); never touches `CLAUDE.md`.
  Runs detached so it never delays session exit.
- **Structured user profile** — `USER.md` now uses a fixed five-section schema
  (`stable_facts · preferences · working_patterns · recent_corrections · open_threads`)
  under a hard ~500-token cap, with poisoning guards (evidence-required, date-tagged
  provenance, dedupe, and contradiction→`recent_corrections` instead of overwrite). Loaded
  every session by `session-init.sh`. See [templates/USER.md.example](templates/USER.md.example).
- **`/whoami` skill** — read-only render of the profile with section counts, token-cap
  check, and a prune nudge.
- **Skill self-maintenance** — `hooks/self-edit-gate.sh` (PostToolUse `Write|Edit`)
  advisorily audits self-edited `SKILL.md` files (frontmatter, ≤15 KB, secret scan);
  `hooks/skill-usage-log.sh` (PostToolUse `Skill`) records skill usage to
  `data/skill-usage.jsonl`, seeded by `scripts/skill-usage-backfill.sh`.
- **`/budget` skill** — read-only context-window estimator that ranks the heaviest skill
  descriptions and estimates total context weight; `--cost` for real spend.
- **Comparison: Claudex vs Hermes Agent** (README) — sourced positioning vs Nous Research's
  Hermes; refreshed the OpenClaw comparison to reflect the deterministic memory loop.

### Changed
- `settings.json` templates now wire the full hook set (self-edit-gate, skill-usage-log,
  memory-curate) alongside the existing SessionStart/Stop hooks.
- `docs/hooks-guide.md` documents the four self-improvement hooks and the live wiring.

## 2026-06-03 — Portability & extension-surface release

### Added
- **Categorized skill set (160 skills)** — every `SKILL.md` now carries
  `category` / `maturity` / `tags` frontmatter against a 15-category controlled
  vocabulary. Skills that need helper code ship their vendored `scripts/`, and
  those that wrap an external project ship an `INSTALL.md` with env-var setup.
- **Slash commands** (`commands/`) — 12 user-triggered commands including
  `/audit`, `/briefing`, `/recap`, `/remember`, `/project`, `/cron`, and a
  guard-railed `/ship`.
- **Lifecycle hooks** (`hooks/`) — `auto-git-add`, `lint-on-write`,
  `notify-on-error`, `snapshot-on-stop`.
- **MCP registry** (`mcp/`) — 11 ready-to-use server configs plus `install.sh`
  to deep-merge them into a project `.mcp.json`.
- **Recommended marketplace plugins** (`plugins/recommended.md`).
- **Three new sub-agents** — `tester`, `incident-responder`, `documentarian`
  (9 agents total).
- **Skill tooling** — `scripts/skill-audit.sh` (frontmatter + path-leak audit)
  and `scripts/skill-index.sh` (generates `data/skill-index.json` and
  `docs/skills-catalog.md`).
- **Guide docs** — `commands-guide`, `hooks-guide`, `mcp-guide`,
  `plugins-guide`, and `skill-anatomy`.
- **`templates/settings.json.example`** — an annotated, safe-by-default
  permissions reference alongside the autonomous default.

### Changed
- **Model → Opus 4.8** across agent definitions, launch scripts, and docs.
- **Zero-click first start** — `bootstrap.sh` now pre-approves the two one-time
  gates (`skipDangerousModePermissionPrompt` and the per-project
  `hasTrustDialogAccepted`) so a fresh, headless install runs with no interactive
  prompts.
- **Permissions documentation** — clarified that `bypassPermissions` is the
  intended default for a headless Telegram agent (no terminal to approve
  prompts), with the `deny` list as the guardrail that is enforced even in
  bypass mode.
- **Portability** — machine-specific absolute paths replaced with `$HOME` /
  per-project env-var defaults across skills, scripts, and docs.

### Removed
- Private, workspace-only skills are excluded from the public showcase via
  `private: true` frontmatter plus a `.sync-exclude` safety net.

### Security
- Repo-wide privacy pass: home paths, personal identifiers, example data, and
  third-party references genericized; commit history normalized to a single
  public identity.

## Earlier

- Multi-provider RAG memory search, health metrics, task inbox, and lifecycle
  hooks.
- Three-layer persistence (tmux + systemd + watchdog cron).
- Telegram channel integration and the initial skill library.
- Initial Claudex showcase: single-file `CLAUDE.md` identity, sub-agents, and
  the architecture writeup.
