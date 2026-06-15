# Changelog

Notable changes to the Claudex reference implementation. This documents a
showcase/reference repo rather than a versioned package, so entries are grouped
by date. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-06-15 — Cross-model verification gate (verifier)

### Added
- **`verifier` skill + engine** — a double-model verification gate that runs a fresh Anthropic
  (Claude) review *and* an independent OpenAI/Azure critic against an explicit goal and acceptance
  criteria, then reconciles the two before a "done" claim is allowed. Invocable on demand via `/verify`.
- **`scripts/verifier/verify.cjs`** — the independent (Layer B) critic: a zero-dependency Node engine
  that calls a non-Anthropic model (OpenAI by default, Azure Foundry by config) over `/chat/completions`
  or the Codex CLI and returns one schema-validated verdict (`scripts/verifier/verdict.schema.json`).
- **Context profiles (`config/verify-profiles/`)** — `default`, `curation-helper`, `trading`, and
  `public-web` supply provenance, trust, threat model, scale, non-goals, and invariants, so the engine
  classifies each finding as **blocking** or **advisory** from structured fields rather than prose —
  which keeps it from over-flagging theoretical, unreachable issues.
- **`config/verifier.json`** — provider/model/backend selection (OpenAI ↔ Azure Foundry swap), per-tier
  model routing, and a monthly spend ceiling enforced through an append-only ledger.

## 2026-06-14 — Positioning rewrite, curation/restart hardening, skill-description cleanup

### Changed
- **README positioning** — the per-competitor comparison tables (Claudex vs OpenClaw, Claudex
  vs Hermes Agent) are replaced by a single **"Where Claudex Fits"** section that states what
  Claudex is, what it deliberately is not, and when to choose it — no feature-by-feature
  scorekeeping against other projects.
- **Watchdog restart** now passes `--continue`, so cron and proactive restarts resume the prior
  conversation instead of cold-starting; the stale "4h" session-age strings now match the actual
  72h constant.
- **`scripts/memory-curate.cjs`** parses the model's JSON array with a three-tier extractor
  (whole-output parse → greedy span → string-aware balanced scan), so a prose-wrapped response
  no longer discards an entire curation cycle's facts.
- **`scripts/skill-audit.sh`** now errors on low-quality descriptions (`[TODO]` placeholders,
  leaked shell/path lines, name-restating "X Skill" titles, truncated fragments), so the
  `self-edit-gate` catches them instead of letting them ship.

### Removed
- **The Hermes Agent comparison** — it asserted version, repo, and issue specifics that could not
  be verified against a real project; removed in full rather than left as unsourced positioning.
- **`research-pipeline` skill** — an unimplemented `[TODO]` scaffold that overlapped
  `deep-research`; dropped from the catalog.

### Fixed
- Rewrote 19 skill descriptions that were title-only, a leaked shell line, a `cd` path, or a
  truncated fragment into "what it does + when to use it"; regenerated the public skill index and
  catalog (161 skills).

## 2026-06-12 — Memory curation: Stop hook → isolated cron pipeline

### Changed
- **Memory curation now runs from cron** (`17 */2 * * *` → `scripts/memory-curate-cron.sh`
  → `scripts/memory-curate.cjs --scan`), replacing the Stop-hook design. Stop fires after
  *every turn* of a channel-driven session, and a hook-spawned `claude -p` loads any
  user-level channel plugin — whose poller displaces the live session's connection
  (one `getUpdates` consumer per bot token). The cron spawn is **plugin-isolated**
  (`--setting-sources project --strict-mcp-config`, neutral cwd, sandboxed channel state,
  stripped channel/API tokens) and still runs on OAuth credentials at zero metered cost.
- **Byte-offset transcript tracking** — each session file is curated incrementally and
  exactly once (no gaps, no double-processing); failed windows are retried, not skipped.
- **Profile lifecycle** — open threads auto-resolve when later transcripts show the work
  finished, and expire after 30 days; an already-known digest of `CLAUDE.md` stops the
  profile from re-recording facts that are loaded every session anyway; trade-call/market
  chatter is explicitly excluded; daily notes consolidate to one auto-curated section per day.
- **Failure visibility** — three consecutive model failures append a warning to the daily
  note (fail-open, never fail-silent).
- **Watchdog** — channel-health gate lowered from 1 h to 10 min for faster poller recovery.
- `hooks/memory-curate.cjs` moved to `scripts/memory-curate.cjs`; `hooks/memory-curate.sh`
  is now a deprecation tombstone. Settings templates no longer wire curation into Stop, and
  `bootstrap.sh` installs the curation cron.

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
- **Comparison sections** (README) — refreshed the OpenClaw comparison to reflect the
  deterministic memory loop. _(Superseded 2026-06-14: the comparison tables were replaced by the
  "Where Claudex Fits" section.)_

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
