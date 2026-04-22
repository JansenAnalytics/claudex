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
- 🔧 **Has skills** — 160 portable skill modules for everything from weather to code review to system monitoring
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
  - [Health Monitoring](#health-monitoring)
  - [Task Inbox](#task-inbox)
  - [MCP Servers](#mcp-servers)
- [Comparison: Claudex vs OpenClaw](#comparison-claudex-vs-openclaw)
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
│  │  │  Telegram  │  │   160 Skills      │   │  │
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

- **Claude Max subscription** ($100/mo) — provides Opus 4.6 with 1M context, zero per-token cost
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
cp templates/settings.json ~/.claude-agent/.claude/settings.json

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

**This repo includes all 160 production-tested skills** covering:
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

⚠️ **Important format note:** Hooks use a `{ matcher, hooks: [{ type, command }] }` structure — NOT a flat `{ type, command }` at the top level. This was a debugging gotcha during our setup.

See [docs/automation.md](docs/automation.md) for scheduled tasks, `/loop`, and event-driven patterns.

### Production Hook Setup

The default `settings.json` ships with three hooks:

1. **SessionStart** → `session-init.sh` — logs start, checks for interrupted tasks, processes inbox, rotates logs, runs incremental memory reindex
2. **PostToolUse** → auto-stages git changes after Write/Edit operations
3. **Stop** → `session-shutdown.sh` — saves interrupted task state, records health event

For a locked-down production setup, see [templates/settings.production.json](templates/settings.production.json).

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

## Comparison: Claudex vs OpenClaw

This system was built as an alternative to [OpenClaw](https://github.com/openclaw/openclaw), replicating its autonomous agent capabilities using Claude Code. Here's an honest comparison:

### What Claudex Does Better

| Feature | Detail |
|---|---|
| ** Cost model** | Flat $100/mo (Max subscription) vs variable API billing ($30-100+/mo). No per-token surprises. Heavy users save significantly. |
| ** Context window** | 1M tokens (Opus 4.6 via Max) vs ~200K typical API. Massive context for complex tasks. |
| ** Mobile control** | `claude.ai/code` Remote Control — manage from phone/browser. OpenClaw: Telegram only. |
| ** Native sub-agents** | Built-in agent teams with shared task lists and direct communication. OpenClaw: `sessions_spawn` with manual polling. |
| ** Skills auto-loading** | Skills auto-selected by description match. OpenClaw: manual scan of `<available_skills>` list. |
| ** Lifecycle hooks** | Rich hook system (SessionStart, Stop, PostToolUse, etc.). OpenClaw: limited hook support. |
| ** Scheduled tasks** | Desktop + Cloud scheduled tasks, `/loop` polling. OpenClaw: cron-only scheduling. |
| ** Permission modes** | Granular: `default`, `plan`, `bypassPermissions` with per-tool allowlists. OpenClaw: binary policy. |
| ** Agent Teams** | Multi-agent coordination with shared context (experimental). OpenClaw: independent sub-agent sessions. |
| ** No infrastructure** | No gateway daemon, no config files, no port management. Just `claude` + workspace. |
| ** Cross-agent RAG** | Built-in cross-agent semantic search — query what Kite, Poe, or Argus know. OpenClaw: requires manual symlinks. |
| ** Health monitoring** | Built-in health metrics, uptime tracking, session counts. OpenClaw: manual monitoring only. |

### What OpenClaw Does Better

| Feature | Detail |
|---|---|
| **📡 Multi-channel** | Telegram, Discord, WhatsApp, Signal, Slack, iMessage, IRC, Google Chat — all native. Claudex: Telegram + Discord + iMessage only (via plugins). |
| ** Paired nodes** | Camera/screen/location control on phones and other devices. Claudex: no equivalent. |
| ** Browser control** | Dual mode: headless Playwright + live Chrome relay via extension. Claudex: Bash + Playwright only (no live browser relay). |
| ** Canvas** | Render HTML/React UIs inline in chat. Claudex: no equivalent. |
| ** ClawHub** | Skill marketplace with `clawhub install/publish`. Claudex: manual skill management only. |
| ** TTS** | Built-in `tts` tool + ElevenLabs integration. Claudex: needs MCP server or manual setup. |
| ** Heartbeat system** | Native heartbeat polling with `HEARTBEAT.md`. Claudex: approximated via scheduled tasks. |
| ** Always-on guarantee** | Gateway daemon designed for 24/7 uptime. Claudex: sessions can timeout, need restart infrastructure. |
| ** Image analysis** | Native `image` tool with vision model. Claudex: via Bash + API or MCP. |
| ** Message tool** | Rich `message` tool with reactions, polls, buttons, effects. Claudex: basic send/receive. |
| ** Session management** | `sessions_list`, `sessions_send`, `sessions_history` for cross-session communication. Claudex: independent sessions only. |
| ** Secret management** | Built-in secret/token handling. Claudex: env vars + manual management. |

### What's Roughly Equivalent

| Feature | Notes |
|---|---|
| **Telegram messaging** | Both native, both work well. OpenClaw slightly richer (reactions, buttons, polls). |
| **Skills** | Both have skill systems. OpenClaw has 160 skills via ClawHub; Claudex can port them. |
| **Memory & RAG** | Both have vector semantic search + FTS5 hybrid. OpenClaw: built-in `memory_search` tool. Claudex: custom RAG engine with cross-agent search. Both index session transcripts. |
| **Sub-agents** | Both spawn sub-agents. OpenClaw: `sessions_spawn`. Claudex: built-in subagents. |
| **GitHub integration** | Both use `gh` CLI. Claudex also supports MCP GitHub server. |
| **File operations** | Both: Read/Write/Edit/Exec. Identical capability. |
| **Web search** | Both supported. OpenClaw: built-in Brave API. Claudex: MCP or Bash. |
| **Systemd persistence** | Both use systemd. Claudex additionally has tmux + watchdog layers. |
| **Task queuing** | Both can queue tasks. Claudex: inbox.json + cron. OpenClaw: HEARTBEAT.md + cron. |

### Bottom Line

**Choose Claudex if:** You want zero API cost, maximum context window (1M tokens), simple setup (no gateway/config), and you primarily use Telegram. Great for single-user autonomous agents.

**Choose OpenClaw if:** You need multi-channel support (WhatsApp, Discord, Signal, etc.), paired device control, browser relay, or the full ClawHub skill ecosystem. Better for complex multi-surface deployments.

**Use both:** They can coexist on the same machine — Claudex as the "always thinking" daemon with huge context, OpenClaw for its unique multi-channel and device capabilities. This is exactly what we do.

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
│   ├── automation.md               #   Hooks, scheduled tasks, /loop
│   ├── skills-guide.md             #   Skill format, auto-selection, porting
│   ├── skills-catalog.md           #   Full catalog of all 160 skills
│   ├── subagents.md                #   Custom sub-agents and teams
│   ├── claude-md-guide.md          #   Writing an effective CLAUDE.md
│   ├── mcp-servers.md              #   MCP server configuration
│   └── inbox.md                    #   Task inbox — full guide and API
├── skills/                         # 160 production-tested skill modules
│   ├── weather/SKILL.md
│   ├── github-workflow/SKILL.md
│   ├── memory-search/SKILL.md
│   ├── watchdog/SKILL.md
│   └── ... (160 total)
├── agents/                         # Custom sub-agent definitions
│   ├── researcher.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── analyst.md
│   ├── sysadmin.md
│   └── writer.md
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
│   ├── health-check.cjs            #   Health metrics recorder and reporter
│   ├── inbox.cjs                   #   Task inbox — add, list, consume tasks
│   ├── session-init.sh             #   SessionStart hook — inbox check, reindex, log rotate
│   ├── session-shutdown.sh         #   Stop hook — save interrupted tasks, record health
│   ├── start-claudex.sh            #   Start agent (tmux)
│   ├── stop-claudex.sh             #   Stop agent
│   ├── restart-claudex.sh          #   Restart agent
│   ├── status-claudex.sh           #   Status check (all layers + health)
│   └── watchdog-claudex.sh         #   Auto-restart watchdog
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
│   ├── skills/                     # 160 skill modules (copied from repo)
│   ├── agents/                     # 6 sub-agent definitions
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

Real issues we encountered during setup, and their fixes:

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

**Problem:** Even with `bypassPermissions` in settings.json, the first session start requires an interactive "yes" confirmation.

**Workaround:** Start the first session interactively (via tmux), confirm the prompt, then subsequent auto-restarts work without prompting. The `--continue` flag resumes the existing session.

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

This system was built by Aksel Jansen ([@JansenAnalytics](https://github.com/JansenAnalytics)) with Kite (an OpenClaw-based AI agent) as a way to replicate and extend OpenClaw's autonomous agent capabilities using Claude Code's native features.

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
