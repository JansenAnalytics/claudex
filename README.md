# Claudex — Autonomous Claude Code Agent

> A reference implementation for building persistent, Telegram-connected autonomous AI agents using [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and a Claude Max subscription. Zero API cost. Full autonomy. Runs 24/7 on any Linux machine.

[![Claude Code](https://img.shields.io/badge/Claude_Code-v2.1+-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Telegram](https://img.shields.io/badge/Channel-Telegram-blue?logo=telegram)](docs/telegram-setup.md)

---

## What Is This?

Claudex is an **autonomous AI agent** that runs as a persistent daemon on a Linux machine (tested on WSL2/Ubuntu). It:

- 💬 **Connects to Telegram** — real-time two-way messaging, just like a human chat
- 🧠 **Has memory** — CLAUDE.md for identity/rules + daily memory files for continuity across sessions
- 🔧 **Has skills** — 161 portable skill modules for everything from weather to code review to system monitoring
- 🤖 **Spawns sub-agents** — delegate parallel work to specialized agents (researcher, coder, reviewer, etc.)
- 🔄 **Self-heals** — watchdog cron + systemd auto-restart keeps it alive 24/7
- 💰 **Zero API cost** — runs on Claude Max subscription ($100/mo flat), not per-token billing

This repo documents the complete system architecture, provides templates for building your own, and includes the actual scripts and configurations used in production.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
  - [Identity (CLAUDE.md)](#identity-claudemd)
  - [Skills](#skills)
  - [Sub-agents](#sub-agents)
  - [Telegram Integration](#telegram-integration)
  - [Persistence](#persistence)
  - [Memory & RAG System](#memory--rag-system)
  - [Hooks & Automation](#hooks--automation)
  - [Self-Improvement Loops](#self-improvement-loops)
  - [Health Monitoring](#health-monitoring)
  - [Task Inbox](#task-inbox)
  - [MCP Servers](#mcp-servers)
- [Where Claudex Fits](#where-claudex-fits)
- [Directory Structure](#directory-structure)
- [Debugging & Gotchas](#debugging--gotchas)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture

```
┌────────────────────────────────────────────────┐
│              YOUR LINUX MACHINE                │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │         CLAUDE CODE (tmux/systemd)       │  │
│  │                                          │  │
│  │  ┌──────────┐  ┌────────┐  ┌──────────┐  │  │
│  │  │ CLAUDE.md│  │ Memory │  │Sub-agents│  │  │
│  │  │ (soul,   │  │ (daily │  │(research,│  │  │
│  │  │  user,   │  │  notes)│  │ coder,   │  │  │
│  │  │  rules)  │  │        │  │ writer)  │  │  │
│  │  └──────────┘  └────────┘  └──────────┘  │  │
│  │                                          │  │
│  │  ┌──────────┐  ┌────────┐                │  │
│  │  │  Health  │  │ Inbox  │                │  │
│  │  └──────────┘  └────────┘                │  │
│  │                                          │  │
│  │  ┌────────────┐  ┌───────────────────┐   │  │
│  │  │  Telegram  │  │   161 Skills      │   │  │
│  │  │  Channel   │  │  (.claude/skills/)│   │  │
│  │  │  (plugin)  │  │                   │   │  │
│  │  └─────┬──────┘  └───────────────────┘   │  │
│  │        │                                 │  │
│  │  ┌─────┴──────┐  ┌───────────────────┐   │  │
│  │  │   Hooks    │  │   MCP Servers     │   │  │
│  │  │ (lifecycle)│  │ (fs, github, web) │   │  │
│  │  └────────────┘  └───────────────────┘   │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │     systemd + watchdog cron (5 min)      │  │
│  │     keeps the agent alive 24/7           │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
                      │
                      │ Telegram Bot API
                      ▼
               ┌──────────────┐
               │    User's    │
               │   Telegram   │
               └──────────────┘
```

---

## Quick Start

### Prerequisites

- **Claude Max subscription** ($100/mo) — provides Opus 4.8 with 1M context, zero per-token cost
- **Linux machine** (WSL2, Ubuntu, Debian, etc.)
- **Node.js 22+** and **Bun** (Bun required for the Telegram channel plugin runtime)

### 1. Install Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude auth login  # authenticate with your Anthropic account
```

### 2. Run the bootstrap script

```bash
git clone https://github.com/JansenAnalytics/claudex.git
cd claudex
bash scripts/bootstrap.sh
```

This creates the workspace at `~/.claude-agent/`, copies templates, and walks you through Telegram setup.

### 3. Manual setup (if you prefer)

```bash
# Create workspace
mkdir -p ~/.claude-agent/{memory,logs,scripts,projects}
mkdir -p ~/.claude-agent/.claude/{skills,agents,rules}

# Copy templates (customize CLAUDE.md with your identity)
cp templates/CLAUDE.md.example ~/.claude-agent/CLAUDE.md

# Permissions — bypassPermissions (autonomous, no prompts). Required for a headless
# Telegram agent; there's no terminal to approve prompts. See "Permissions & Safety".
cp templates/settings.json ~/.claude-agent/.claude/settings.json
# Want the same setup with a deny safety net + inline docs (or to switch to a
# prompting mode for attended use)? Use templates/settings.json.example instead.

# Pre-approve the two one-time first-run gates so the first start needs no clicks
# (scripts/bootstrap.sh does this for you; manual equivalent below):
node -e 'const fs=require("fs"),os=require("os"),p=require("path");const ws=p.join(os.homedir(),".claude-agent");
const m=(f,fn)=>{let d={};try{d=JSON.parse(fs.readFileSync(f,"utf8"))}catch(_){}; fn(d); fs.mkdirSync(p.dirname(f),{recursive:true}); fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n")};
m(p.join(os.homedir(),".claude","settings.json"),d=>d.skipDangerousModePermissionPrompt=true);
m(p.join(os.homedir(),".claude.json"),d=>{d.projects=d.projects||{};d.projects[ws]=d.projects[ws]||{};d.projects[ws].hasTrustDialogAccepted=true});'

# Copy skills you want
cp -r skills/* ~/.claude-agent/.claude/skills/

# Copy sub-agents
cp agents/* ~/.claude-agent/.claude/agents/

# Copy rules
cp rules/* ~/.claude-agent/.claude/rules/

# Start Claude Code with Telegram
cd ~/.claude-agent
claude --channels plugin:telegram@claude-plugins-official \
       --dangerously-skip-permissions \
       --continue
```

### 4. Set up Telegram

See the [Telegram Setup Guide](docs/telegram-setup.md) for detailed instructions.

Quick version:
1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. In Claude Code: `/plugin install telegram@claude-plugins-official`
3. Configure: `/telegram:configure <your-bot-token>`
4. Pair your account: `/telegram:access pair <code>` (get code from bot)
5. Lock down: `/telegram:access policy allowlist`

### 5. Make it persistent

```bash
# Install management scripts
cp scripts/start-claudex.sh ~/.claude-agent/scripts/
cp scripts/watchdog-claudex.sh ~/.claude-agent/scripts/

# Enable systemd service
cp systemd/claudex.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable claudex
systemctl --user start claudex
loginctl enable-linger $USER  # survive logout

# Add watchdog cron (auto-restarts if process dies)
(crontab -l 2>/dev/null; echo "*/5 * * * * bash ~/.claude-agent/scripts/watchdog-claudex.sh") | crontab -
```

---

## How It Works

### Identity (CLAUDE.md)

The `CLAUDE.md` file is the agent's soul — personality, rules, context, and operating instructions. It's loaded at session start and stays in context throughout.

```markdown
# CLAUDE.md — Your Agent Name

## Who You Are
Name, personality, boundaries...

## About Your Human
Name, timezone, preferences, communication style...

## Operating Rules
1. Act, then report
2. Verify before announcing
3. Write things down
...

## Key Projects
Links to project directories, key context...
```

See [templates/CLAUDE.md.example](templates/CLAUDE.md.example) for a complete annotated template.

#### Mapping from OpenClaw

| OpenClaw File | Claudex Equivalent | Purpose |
|---|---|---|
| `SOUL.md` | `CLAUDE.md` (personality section) | Who the agent is |
| `USER.md` | `CLAUDE.md` (user section) | Who it's helping |
| `AGENTS.md` | `CLAUDE.md` (rules section) | Operating rules |
| `MEMORY.md` | Auto Memory + `memory/*.md` | Long-term memory |
| `TOOLS.md` | `.claude/CLAUDE.md` | Environment-specific notes |
| `HEARTBEAT.md` | Scheduled tasks + `/loop` | Periodic checks |
| `IDENTITY.md` | `CLAUDE.md` (identity section) | Name, creature, vibe |

### Skills

Skills are modular instruction sets that teach the agent how to handle specific tasks. Each skill is a markdown file with YAML frontmatter:

```markdown
---
name: weather
description: Get current weather and forecasts. Use when the user asks about weather.
---

# Weather Skill

Fetch weather using wttr.in:
\```bash
curl -s "wttr.in/LOCATION?format=%l:+%c+%t+%h+%w"
\```
```

Claude Code auto-selects relevant skills based on the task description. Place skills in `.claude/skills/<name>/SKILL.md`.

**This repo includes all 161 production-tested skills** covering:
- 🌤️ Weather, web monitoring, research
- 💻 GitHub workflow, code review, testing
- 📊 Data analysis, market data, trading
- 🔧 System admin, Docker, CI/CD
- 📝 Documentation, LaTeX, note-taking
- 🔔 Notifications (ntfy), webhooks
- And many more — see [skills/](skills/)

### Sub-agents

Custom sub-agents handle specialized parallel work:

```markdown
# ~/.claude/agents/researcher.md
---
name: researcher
description: Deep research tasks — web search, multi-source analysis, report writing.
model: opus
---

You are a research agent. Given a topic:
1. Search multiple sources
2. Cross-reference findings
3. Synthesize into a clear summary
```

Available sub-agents in this setup:
| Agent | Model | Purpose |
|---|---|---|
| `researcher` | Opus | Multi-source research and analysis |
| `coder` | Opus | Feature implementation, bug fixes |
| `reviewer` | Opus | Code review and PR analysis |
| `analyst` | Opus | Data analysis and market research |
| `sysadmin` | Opus | Infrastructure and ops tasks |
| `writer` | Opus | Documentation, reports, plans |
| `tester` | Opus | Run test suites, parse failures, propose fixes |
| `incident-responder` | Opus | Diagnose incidents from logs/metrics, root-cause, post-mortem |
| `documentarian` | Opus | Inline docs, READMEs, and API references after code changes |

### Telegram Integration

The Telegram channel plugin provides native two-way messaging:

- Messages from Telegram → Claude Code receives and processes
- Claude Code responses → sent back to Telegram
- Supports: text, code blocks, bold/italic, inline keyboards
- Access control: allowlist mode locks to specific Telegram user IDs

See [docs/telegram-setup.md](docs/telegram-setup.md) for the full setup guide.

### Persistence

Three layers keep the agent alive:

1. **tmux session** — detaches from terminal, survives SSH disconnect
2. **systemd user service** — auto-starts on boot, restarts on crash
3. **watchdog cron** — every 5 minutes, three checks: process alive, session age (72h proactive restart), and Telegram delivery health (detects stuck outbound channel without interrupting long tasks)

```
systemd (boot/crash restart)
  └── tmux session "claudex"
        └── claude code process
              └── telegram plugin (bun subprocess)

cron (every 5 min) ──► 1. process alive?
                    ──► 2. session age > 24h? → proactive restart
                    ──► 3. inbound stuck > 10min AND idle? → delivery restart
```

Key: `loginctl enable-linger $USER` makes the systemd user service survive logout.

See [docs/persistence.md](docs/persistence.md) for details and troubleshooting.

### Memory & RAG System

Claudex has a **two-layer memory system**: file-based markdown notes (simple, durable) plus a **vector RAG system** for semantic search across all memories and conversation history.

#### Layer 1: File-Based Memory

- **`CLAUDE.md`** — permanent identity and rules (rarely changes)
- **`memory/YYYY-MM-DD.md`** — daily notes (decisions, tasks, context)
- **Claude's auto-memory** — Claude Code's built-in cross-session learning

#### Layer 2: Vector Memory Search (RAG)

The file-based memory is supplemented by a **semantic search engine** (`scripts/memory-search.cjs`) that indexes everything into a SQLite database for hybrid search. It supports **three embedding providers** with automatic fallback:

1. **OpenAI** (`text-embedding-3-small`) — best quality, ~$0.02/month. Used when `OPENAI_API_KEY` is set.
2. **Ollama** (`nomic-embed-text`) — local, completely free. Used when Ollama is running.
3. **TF-IDF** — zero-dependency fallback, pure Node.js. No API key, no installs needed. Automatically activates when neither OpenAI nor Ollama is available.

The system auto-detects the best available provider, or you can force one:
```bash
export CLAUDEX_EMBEDDING_PROVIDER=tfidf  # or openai, ollama
```

**What gets indexed:**
- All markdown memory files (`CLAUDE.md`, `memory/*.md`)
- Claude Code session transcripts (full conversation history from `~/.claude/projects/`)
- Cross-agent memories (search what other agents know — Kite, Poe, Argus, etc.)

**How it works:**
```
                    ┌──────────────┐
User asks about  →  │ memory-search│  → Top N relevant chunks
  past work         │   .cjs       │     with scores
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Markdown │ │ Session  │ │ Cross-   │
        │ Memory   │ │ Trans-   │ │ Agent    │
        │ Files    │ │ cripts   │ │ Memory   │
        └──────────┘ └──────────┘ └──────────┘
              │            │            │
              └────────────┼────────────┘
                           ▼
                    ┌──────────────┐
                    │   SQLite DB  │
                    │  + FTS5      │
                    │  + Embeddings│
                    └──────────────┘
```

**Search is hybrid** — combines three signals:
1. **Vector similarity** (70% weight) — OpenAI `text-embedding-3-small` embeddings, cosine similarity
2. **Full-text search** (30% weight) — SQLite FTS5 with Porter stemming
3. **Recency decay** — recent memories rank higher (60-day half-life)

**Usage:**
```bash
# Search across all memories
node --experimental-sqlite scripts/memory-search.cjs --search "Harkerud property business plan"

# Filter by source
node --experimental-sqlite scripts/memory-search.cjs --search "query" --source session
node --experimental-sqlite scripts/memory-search.cjs --search "query" --source cross-agent

# Filter by agent
node --experimental-sqlite scripts/memory-search.cjs --search "query" --agent kite

# Full reindex
node --experimental-sqlite scripts/memory-search.cjs --index

# Incremental reindex (only changed files)
node --experimental-sqlite scripts/memory-search.cjs --index --incremental

# Show statistics
node --experimental-sqlite scripts/memory-search.cjs --stats
```

**Automatic indexing:**
- **SessionStart hook** — incremental reindex every time the agent starts a new session
- **Cron job** — reindexes every 30 minutes to catch changes from other agents
- **Embedding cache** — unchanged text is never re-embedded (saves API cost)

See [docs/memory-search.md](docs/memory-search.md) for the full technical guide, including cross-agent setup, configuration, and troubleshooting.

### Hooks & Automation

Hooks fire at lifecycle events:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "echo \"[$(date)] Session started\" >> logs/sessions.log"
      }]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "echo \"[$(date)] Session stopped\" >> logs/sessions.log"
      }]
    }]
  }
}
```

⚠️ **Format note:** hooks use a `{ matcher, hooks: [{ type, command }] }` structure — a flat `{ type, command }` at the top level silently fails to fire. See [Debugging & Gotchas](#debugging--gotchas) for the symptom.

See [docs/automation.md](docs/automation.md) for scheduled tasks, `/loop`, and event-driven patterns.

### Production Hook Setup

The default `settings.json` wires these hooks:

1. **SessionStart** → `session-init.sh` — logs start, checks for interrupted tasks, processes inbox, rotates logs, runs incremental memory reindex, **and loads the curated user profile (`USER.md`) into context**
2. **PostToolUse `Write|Edit`** → auto-stages git changes **+ `self-edit-gate.sh`** (advisory audit of self-edited `SKILL.md` files)
3. **PostToolUse `Skill`** → `skill-usage-log.sh` — records which skill was loaded, when (usage ledger)
4. **Stop** → `session-shutdown.sh` (interrupted-task state, health event). Memory curation runs on a **cron schedule**, not a Stop hook — see below.

For a locked-down production setup, see [templates/settings.production.json](templates/settings.production.json).

### Self-Improvement Loops

Most "self-improving agent" features fire **only if the model remembers to invoke them** — a soft trigger that silently stops working. Claudex's improvement loops are **deterministic**: they fire on Claude Code hooks and schedules, so they happen whether or not the model thinks to. Three loops run automatically, all on the **flat-rate Max subscription with zero metered API cost** (they shell out to the `claude` CLI on OAuth credentials, never `api.anthropic.com`).

**1. Memory curation (cron → `memory-curate.cjs --scan`).** Every two hours, a cheap Haiku-tier reflection reads **new transcript content** — tracked per session file by byte offset, so every message is curated exactly once (no gaps, no double-processing; failed windows are retried, not skipped) — and extracts *only durable facts* — preferences, environment facts, explicit corrections, conventions, completed milestones — as structured JSON. Each fact is routed deterministically: all facts to the dated daily note (one consolidated section per day), user-facts into the structured `USER.md` profile. It is append-only, deduped (against existing memory before writing), size-capped, and **never touches the hand-written `CLAUDE.md`**. An already-known digest of `CLAUDE.md` reserves the profile budget for genuinely new signal, and repeated model failures surface as a warning in the daily note — fail-open, never fail-silent.

> **Why cron and not a Stop hook?** Stop fires after *every turn* of a channel-driven session, and a `claude -p` spawned from a hook loads any user-level channel plugin — whose poller then displaces the live session's connection (Telegram allows one `getUpdates` consumer per bot token). The cron spawn is therefore **plugin-isolated** — `--setting-sources project --strict-mcp-config`, a fresh neutral cwd, sandboxed channel state, stripped channel/API tokens — and still runs on OAuth credentials at zero metered cost. Design details: [docs/hooks-guide.md](docs/hooks-guide.md).

**2. Structured user profile (`USER.md`) + load.** A fixed five-section schema — `stable_facts · preferences · working_patterns · recent_corrections · open_threads` — kept under a hard **~500-token cap**. The curator (item 1) maintains it with poisoning guards: *evidence-required* (factless claims dropped), date-tagged provenance, dedupe, a hard token cap, and **contradiction handling** — a fact that conflicts with an existing belief is recorded as a *new* `recent_corrections` entry rather than silently overwriting the core. Open threads have a lifecycle: they resolve automatically when later transcripts show the work finished, and expire after 30 days. `session-init.sh` loads the profile every SessionStart, and the read-only **`/whoami`** skill renders it with section counts and a prune nudge. See [templates/USER.md.example](templates/USER.md.example).

**3. Skill self-maintenance + usage tracking.**
- **`self-edit-gate.sh`** (PostToolUse `Write|Edit`) — whenever the agent edits one of its own `SKILL.md` files, it auto-runs `skill-audit.sh` + a secret scan and *warns* (advisory; never blocks, never auto-reverts) if the edit breaks frontmatter, exceeds 15 KB, or contains a secret value. So the agent can patch its skills freely with a safety net.
- **`skill-usage-log.sh`** (PostToolUse `Skill`) — appends one JSONL line per skill load to `data/skill-usage.jsonl`; `scripts/skill-usage-backfill.sh` seeds it from historical transcripts. This is the data foundation for catalog curation. (It captures *explicit* Skill-tool invocations, not description-match auto-loads.)

**`/budget` — context-window visibility.** With 161 auto-loaded skill descriptions, description sprawl is a plausible silent tax. The read-only `/budget` skill estimates and **ranks** the token weight of CLAUDE.md, MEMORY.md, USER.md, every skill description (exact ranking from `skill-index.json`), and tool/MCP schemas — so bloat is visible and prunable. Add `--cost` for real spend.

### Permissions & Safety

Claudex runs **`bypassPermissions`** by default — every tool call executes without a prompt. This is deliberate, not a footgun: an always-on agent driven over Telegram has **nobody at the terminal** to click "yes." Any prompting mode (`default`, `acceptEdits`, `plan`) would freeze the session waiting for input that never arrives. Bypass is what lets Claudex act on a message the instant it lands.

The safety story for an unattended agent isn't "prompt the human" — it's:
1. **A `deny` list that fires even in bypass mode** (your real guardrail), and
2. **A dedicated, trusted, single-user host** that is not shared or internet-exposed.

**Zero-click first start — two one-time gates.** `bypassPermissions` is only prompt-free after two acceptances are recorded. `scripts/bootstrap.sh` pre-seeds both, so a fresh install behaves like a long-running one (this is why the maintainer never clicks, and now you won't either):

| Gate | File | Key |
|---|---|---|
| Accept bypass mode | `~/.claude/settings.json` | `skipDangerousModePermissionPrompt: true` |
| Trust the workspace dir | `~/.claude.json` | `projects["<workspace>"].hasTrustDialogAccepted: true` |

**Settings files:**

| File | `defaultMode` | Use it when |
|---|---|---|
| [`templates/settings.json`](templates/settings.json) | `bypassPermissions` | **Default.** The maintainer's exact setup — fully autonomous, zero prompts. |
| [`templates/settings.json.example`](templates/settings.json.example) | `bypassPermissions` | Same, **+ a `deny` safety net + inline docs** for every option. Recommended starting point. |
| [`templates/settings.production.json`](templates/settings.production.json) | `bypassPermissions` | Bypass with a scoped `allow` + `deny` list. |

**Rule precedence — `deny` → `ask` → `allow`, first match wins:**

```json
"permissions": {
  "defaultMode": "bypassPermissions",          // run everything, no prompts (headless)
  "allow": ["Bash(*)", "Read(*)", "Write(*)"],  // ignored under bypass; used if you switch to 'default'
  "ask":   [],                                  // ignored under bypass
  "deny":  ["Bash(rm -rf *)", "Bash(sudo *)", "Write(/etc/*)"]  // ALWAYS blocked, even in bypass
}
```

- **`deny` always wins — even under `bypassPermissions`.** Because bypass ignores `allow`/`ask`, the `deny` list is the *only* guardrail that fires when the agent runs autonomously — so keep one. `rm -rf /` and `rm -rf ~` additionally hard-prompt as a circuit breaker.
- **Running attended instead?** Set `defaultMode` to `default` (prompt on first use of each tool) or `acceptEdits` (auto-approve edits, prompt for other Bash); then the `allow`/`ask` lists govern what runs silently vs. prompts.
- **Bash patterns match a prefix at a word boundary:** `Bash(ls *)` matches `ls -la` but not `lsof`. `Bash(cmd:*)` is a trailing-only alias for `Bash(cmd *)`.
- **`defaultMode` values:** `default`, `acceptEdits`, `plan`, `dontAsk` (auto-deny anything not allowlisted), `auto` (auto-approve with safety checks — research preview), `bypassPermissions`.

⚠️ Run bypass only on a **dedicated, trusted, single-user** machine — never on a shared, multi-user, or internet-exposed host. Full reference: [Claude Code permissions docs](https://code.claude.com/docs/en/permissions).

### Health Monitoring

Track agent health metrics in SQLite — session counts, restart events, uptime:

```bash
# Record events (called automatically by hooks and watchdog)
node --experimental-sqlite scripts/health-check.cjs --record session_start
node --experimental-sqlite scripts/health-check.cjs --record watchdog_ok

# View health report
node --experimental-sqlite scripts/health-check.cjs --report
```

Output:
```
📊 Claudex Health Report
   Uptime (today):          8h 30m
   Sessions (today):         3
   Restarts (today):         0
   Restarts (7d):            1
   Last session:             2026-04-13 14:22
   Last restart:             2026-04-10 03:15
   Avg sessions/day (30d):   4.2
```

Health events are recorded automatically by the lifecycle hooks (SessionStart, Stop) and watchdog cron. Use `status-claudex.sh --full` for a combined process + health view.

### Task Inbox

Queue tasks for the agent from cron jobs, webhooks, or manually:

```bash
# Add tasks
node scripts/inbox.cjs --add "Check email for urgent messages" --priority high --source cron
node scripts/inbox.cjs --add "Review PR #42" --priority normal --source webhook

# List pending
node scripts/inbox.cjs --list
```

```
📥 Inbox (2 pending)
  🔴 [a1b2c3] Check email for urgent messages        (cron, 2h ago)
  🟡 [d4e5f6] Review PR #42                          (webhook, 30m ago)
```

The agent checks the inbox automatically on session start and processes pending tasks. See [docs/inbox.md](docs/inbox.md) for the full guide.

### MCP Servers

MCP (Model Context Protocol) servers extend Claude Code with external tool access:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-filesystem", "/home/user"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

See [docs/mcp-servers.md](docs/mcp-servers.md) for recommended servers and configuration.

---

## Where Claudex Fits

Claudex is a **single-user, always-on Claude Code daemon** — one agent, one operator, one dedicated Linux box, driven over Telegram on a flat-rate Claude Max subscription. It is deliberately narrow, and that focus is the point. What it does well:

- **Stays up on its own.** Three independent layers keep the agent alive — a tmux session, a systemd user service for boot and crash recovery, and a watchdog cron that runs every five minutes to catch what the others miss (a dead process, a dead Telegram connection, a stuck reply). It also refreshes the session every 72 hours to head off plugin channel rot, and restarts resume the prior conversation instead of cold-starting.
- **Improves itself deterministically.** Memory curation runs on a schedule — a 2-hourly cron that reads each transcript exactly once by byte offset — while skill auditing and usage logging fire on `PostToolUse` hooks. These are wired into the harness and run every time, not "if the model remembers."
- **Remembers across sessions.** A hybrid retrieval engine combines SQLite FTS5 keyword search with vector embeddings (OpenAI by default, a local Ollama model or a zero-dependency fallback otherwise) over transcripts and memory files, alongside a structured, auto-curated `USER.md` profile that loads into every session.
- **Costs a flat rate.** The agent, its sub-agents, and every restart run on a Claude Max subscription over OAuth — no per-token Anthropic bill. (Embeddings optionally spend a few cents of OpenAI per month; everything else is free to run.)

What Claudex is **not**, by design:

- **Not a multi-channel gateway** — it is Telegram-first, not a WhatsApp / Discord / Signal / Slack hub.
- **Not a multi-device controller** — no paired phones, cameras, or live browser relay.
- **Not a skill marketplace** — skills are plain files you copy and edit, not installs from a registry.
- **Not a multi-model router** — it runs a single model on a flat-rate subscription on purpose.
- **Not an autonomous prompt-optimizer** — Claudex genuinely self-improves (memory curation, skill auditing, usage tracking, and patch-on-friction skill edits; see [Self-Improvement Loops](#self-improvement-loops)), but through deterministic, audited, human-reviewable changes — not a hands-off search loop (GEPA/DSPy-style) that rewrites its own prompts against an eval metric. Prose skills have no ground-truth oracle, so an unsupervised rewrite loop would optimize for "looks confident," not "works."

Claudex began as an effort to reproduce the capabilities of a purpose-built autonomous messaging agent — [OpenClaw](https://github.com/openclaw/openclaw), which inspired this project — using only Claude Code's native features (hooks, sub-agents, skills, MCP) instead of a custom gateway. If you need broad multi-channel reach, device control, or a skill marketplace, a dedicated gateway like OpenClaw is the better tool, and the two run happily on the same machine. If you want a deterministic, flat-rate, always-on single agent that lives in the Claude Code ecosystem and owns its own box, that is exactly what Claudex is for.

---

## Directory Structure

### This Repository

```
claudex/
├── README.md                       # You're reading it
├── LICENSE                         # MIT
├── CONTRIBUTING.md                 # Contribution guidelines
├── docs/                           # Comprehensive documentation
│   ├── architecture.md             #   System architecture + Mermaid diagrams
│   ├── memory-search.md            #   Vector RAG system (setup, config, API)
│   ├── telegram-setup.md           #   Telegram integration step-by-step
│   ├── persistence.md              #   3-layer persistence (tmux+systemd+cron)
│   ├── interactive-use.md          #   Interactive/IDE use + session persistence
│   ├── automation.md               #   Hooks, scheduled tasks, /loop
│   ├── skills-guide.md             #   Skill format, auto-selection, porting
│   ├── skills-catalog.md           #   Full catalog of all 161 skills
│   ├── subagents.md                #   Custom sub-agents and teams
│   ├── claude-md-guide.md          #   Writing an effective CLAUDE.md
│   ├── mcp-servers.md              #   MCP server configuration
│   ├── inbox.md                    #   Task inbox — full guide and API
│   ├── commands-guide.md           #   Slash commands — anatomy + the 12 shipped
│   ├── hooks-guide.md              #   Lifecycle hooks — events, wiring, examples
│   ├── mcp-guide.md                #   MCP registry — configs + install
│   ├── plugins-guide.md            #   Marketplace plugins that pair with Claudex
│   └── skill-anatomy.md            #   SKILL.md schema — categories, maturity, tags
├── skills/                         # 161 production-tested skill modules
│   ├── weather/SKILL.md
│   ├── github-workflow/SKILL.md
│   ├── memory-search/SKILL.md
│   ├── watchdog/SKILL.md
│   └── ... (161 total)
├── agents/                         # Custom sub-agent definitions (9)
│   ├── researcher.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── analyst.md
│   ├── sysadmin.md
│   ├── writer.md
│   ├── tester.md
│   ├── incident-responder.md
│   └── documentarian.md
├── commands/                       # 12 slash commands (/audit, /ship, /recap, …)
├── hooks/                          # 4 lifecycle hook scripts
├── mcp/                            # MCP server registry + configs + install.sh
├── plugins/                        # Recommended marketplace plugins
├── rules/                          # Global behavior rules
│   ├── safety.md
│   └── telegram.md
├── templates/                      # Setup templates
│   ├── CLAUDE.md.example           #   Annotated identity template
│   ├── settings.json               #   Permissions + hooks config
│   ├── settings.production.json    #   Locked-down production hook config
│   ├── .mcp.json.example           #   Example MCP server configuration
│   └── rag-config.json.example     #   Example RAG/embedding provider config
├── scripts/                        # Management + infrastructure
│   ├── bootstrap.sh                #   Automated setup script
│   ├── memory-search.cjs           #   Vector RAG search engine (multi-provider)
│   ├── memory-reindex.sh           #   Cron-based incremental reindexing
│   ├── memory-curate.cjs           #   Durable-fact distiller (cron; byte-offset transcripts)
│   ├── memory-curate-cron.sh       #   2-hourly cron wrapper (plugin-isolated claude -p)
│   ├── health-check.cjs            #   Health metrics recorder and reporter
│   ├── inbox.cjs                   #   Task inbox — add, list, consume tasks
│   ├── session-init.sh             #   SessionStart hook — inbox check, reindex, log rotate
│   ├── session-shutdown.sh         #   Stop hook — save interrupted tasks, record health
│   ├── start-claudex.sh            #   Start agent (tmux)
│   ├── stop-claudex.sh             #   Stop agent
│   ├── restart-claudex.sh          #   Restart agent
│   ├── status-claudex.sh           #   Status check (all layers + health)
│   ├── watchdog-claudex.sh         #   Auto-restart watchdog
│   ├── skill-audit.sh              #   Audit SKILL.md frontmatter + path leaks
│   └── skill-index.sh              #   Generate skill-index.json + skills-catalog.md
├── systemd/                        # Systemd user service
│   └── claudex.service
└── examples/                       # Complete workspace example
    └── workspace/                  #   Sanitized production workspace
```

### Deployed Workspace (created by `bootstrap.sh`)

```
~/.claude-agent/                    # Agent workspace root
├── CLAUDE.md                       # Your agent's identity (customize this!)
├── .claude/
│   ├── settings.json               # Permissions, hooks, env vars
│   ├── skills/                     # 161 skill modules (copied from repo)
│   ├── agents/                     # 9 sub-agent definitions
│   └── rules/                      # Safety + Telegram formatting rules
├── data/
│   └── memory.sqlite               # Vector RAG database (auto-created)
├── memory/                         # Daily memory files
│   └── YYYY-MM-DD.md
├── logs/                           # Session, watchdog, and reindex logs
├── scripts/                        # Management scripts (copied from repo)
│   ├── memory-search.cjs           #   Vector RAG search engine
│   ├── memory-reindex.sh           #   Incremental reindexer
│   ├── start-claudex.sh
│   ├── stop-claudex.sh
│   ├── restart-claudex.sh
│   ├── status-claudex.sh
│   └── watchdog-claudex.sh
└── projects/                       # Symlinks to your project directories
```

---

## Debugging & Gotchas

Common issues and their fixes:

### 1. ANTHROPIC_API_KEY Conflicts with OAuth

**Problem:** If `ANTHROPIC_API_KEY` is set in your environment (e.g., from `.bashrc`), Claude Code prompts to use the API key instead of your Max subscription OAuth. This breaks autonomous restart because the prompt requires interactive confirmation.

**Fix:** Explicitly `unset ANTHROPIC_API_KEY` in your start script before launching Claude Code:

```bash
# In start-claudex.sh
unset ANTHROPIC_API_KEY
exec claude --channels plugin:telegram@claude-plugins-official ...
```

### 2. Hook Format — Nested Structure Required

**Problem:** Hooks silently fail if you use a flat structure.

```json
// ❌ WRONG — hooks won't fire
"SessionStart": [{ "type": "command", "command": "echo hi" }]

// ✅ CORRECT — matcher + hooks array
"SessionStart": [{ "matcher": "", "hooks": [{ "type": "command", "command": "echo hi" }] }]
```

The `matcher` field filters which events trigger the hook (empty string = match all).

### 3. Bun Required for Telegram Plugin

**Problem:** The Telegram channel plugin (`telegram@claude-plugins-official`) uses Bun as its runtime, not Node.js.

**Fix:** Install Bun and ensure it's in PATH:
```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"  # add to your start script
```

### 4. Session Termination on SIGTERM (Code 143)

**Problem:** `systemctl --user stop claudex` sends SIGTERM, which kills Claude Code with exit code 143. Systemd sees this as a crash and triggers `Restart=on-failure`.

**Workaround:** Use `KillMode=process` and `TimeoutStopSec=30` in the systemd unit. The watchdog cron is the primary restart mechanism; systemd is the backup.

### 5. `--dangerously-skip-permissions` Still Prompts on First Start

**Problem:** Even with `bypassPermissions` in settings.json, the first session start requires an interactive "yes" confirmation — twice: once to accept bypass mode, once to trust the workspace folder. Fatal for a headless agent with nobody at the terminal.

**Fix:** `scripts/bootstrap.sh` now pre-seeds both acceptances, so a fresh install starts prompt-free:

| Gate | File | Key |
|---|---|---|
| Accept bypass mode | `~/.claude/settings.json` | `skipDangerousModePermissionPrompt: true` |
| Trust workspace dir | `~/.claude.json` | `projects["<workspace>"].hasTrustDialogAccepted: true` |

If you set up manually (without bootstrap), write those two keys before the first launch — see the one-liner in the [Manual setup](#3-manual-setup-if-you-prefer) section. Then `--continue` resumes the session on every auto-restart. (Note: `--dangerously-skip-permissions` refuses to run as **root/sudo** outside a recognized sandbox — run as a normal user or use the dev-container config.)

### 6. Script Wrapping for PTY

**Problem:** Claude Code needs a TTY, but systemd doesn't provide one. Without a PTY, the process fails silently.

**Fix:** Use `script -qc "..." /dev/null` or tmux to provide a pseudo-terminal:
```bash
exec script -qc "claude --channels ... --dangerously-skip-permissions --continue" logfile.log
```

### 7. Telegram Access Configuration Location

The Telegram channel plugin stores its access config at:
```
~/.claude/channels/telegram/access.json
```

Not in the workspace — in the user-level `.claude` directory. The allowlist and paired accounts live here.

### 8. Embedding Provider Mismatch After Switching

**Problem:** If you switch embedding providers (e.g., from OpenAI to TF-IDF), existing chunks have embeddings from the old provider with different dimensions. Vector search returns 0 similarity for those chunks.

**Fix:** Run a full reindex after changing providers:
```bash
node --experimental-sqlite scripts/memory-search.cjs --index  # full reindex (not --incremental)
```
The system handles dimension mismatches gracefully (falls back to FTS-only scoring), but a full reindex ensures optimal search quality.

---

## Examples

### Complete Workspace Example

See [examples/workspace/](examples/workspace/) for a sanitized version of a production Claudex setup with all components configured.

### Example Skills

See [skills/](skills/) for production-tested skills including:
- `weather` — fetch forecasts from wttr.in
- `github-workflow` — full git + GitHub operations
- `watchdog` — system health monitoring
- `web-monitor` — URL change detection with alerts
- `system-admin` — server management and diagnostics

### Example Sub-agents

See [agents/](agents/) for specialized sub-agent definitions.

---

## Origins

This system was built by [@JansenAnalytics](https://github.com/JansenAnalytics) with Kite (an OpenClaw-based AI agent) as a way to replicate and extend OpenClaw's autonomous agent capabilities using Claude Code's native features.

The goal: prove that a persistent, Telegram-connected, skill-equipped, self-healing AI agent can be built entirely on Claude Code's subscription model — no custom gateway, no API billing, no infrastructure beyond a Linux box.

It works. We run both systems side by side.

---

## Contributing

Contributions welcome! Areas where help is needed:

- **More skills** — port your favorite OpenClaw skills or create new ones
- **More channels** — Discord, WhatsApp integration patterns
- **Better persistence** — improvements to session stability and auto-restart
- **Scheduled tasks** — patterns for recurring autonomous work
- **MCP servers** — useful server configurations

Please open an issue or PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic. Claudex is not affiliated with or endorsed by Anthropic.*
