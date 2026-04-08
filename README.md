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
- 🔧 **Has skills** — 155+ portable skill modules for everything from weather to code review to system monitoring
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
  - [Memory System](#memory-system)
  - [Hooks & Automation](#hooks--automation)
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
│  │  ┌────────────┐  ┌───────────────────┐   │  │
│  │  │  Telegram  │  │   155+ Skills     │   │  │
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
git clone https://github.com/janseninvest/claudex.git
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
cp -r examples/skills/* ~/.claude-agent/.claude/skills/

# Copy sub-agents
cp examples/agents/* ~/.claude-agent/.claude/agents/

# Copy rules
cp examples/rules/* ~/.claude-agent/.claude/rules/

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

**This repo includes 155+ production-tested skills** covering:
- 🌤️ Weather, web monitoring, research
- 💻 GitHub workflow, code review, testing
- 📊 Data analysis, market data, trading
- 🔧 System admin, Docker, CI/CD
- 📝 Documentation, LaTeX, note-taking
- 🔔 Notifications (ntfy), webhooks
- And many more — see [examples/skills/](examples/skills/)

### Sub-agents

Custom sub-agents handle specialized parallel work:

```markdown
# ~/.claude/agents/researcher.md
---
name: researcher
description: Deep research tasks — web search, multi-source analysis, report writing.
model: sonnet
---

You are a research agent. Given a topic:
1. Search multiple sources
2. Cross-reference findings
3. Synthesize into a clear summary
```

Available sub-agents in this setup:
| Agent | Model | Purpose |
|---|---|---|
| `researcher` | Sonnet | Multi-source research and analysis |
| `coder` | Sonnet | Feature implementation, bug fixes |
| `reviewer` | Sonnet | Code review and PR analysis |
| `analyst` | Sonnet | Data analysis and market research |
| `sysadmin` | Sonnet | Infrastructure and ops tasks |
| `writer` | Sonnet | Documentation, reports, plans |

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
3. **watchdog cron** — every 5 minutes, checks if the process is alive and restarts if not

```
systemd (boot/crash restart)
  └── tmux session "claudex"
        └── claude code process
              └── telegram plugin (bun subprocess)

cron (every 5 min) ──► watchdog checks PID ──► restarts if dead
```

Key: `loginctl enable-linger $USER` makes the systemd user service survive logout.

See [docs/persistence.md](docs/persistence.md) for details and troubleshooting.

### Memory System

Claudex uses a file-based memory system:

- **`CLAUDE.md`** — permanent identity and rules (like DNA — rarely changes)
- **`memory/YYYY-MM-DD.md`** — daily notes (what happened today, decisions made, tasks completed)
- **Claude's auto-memory** — Claude Code automatically remembers key learnings across sessions

The agent reads recent memory files at session start to restore context about ongoing work.

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
| **💰 Cost model** | Flat $100/mo (Max subscription) vs variable API billing ($30-100+/mo). No per-token surprises. Heavy users save significantly. |
| **🧠 Context window** | 1M tokens (Opus 4.6 via Max) vs ~200K typical API. Massive context for complex tasks. |
| **📱 Mobile control** | `claude.ai/code` Remote Control — manage from phone/browser. OpenClaw: Telegram only. |
| **🤝 Native sub-agents** | Built-in agent teams with shared task lists and direct communication. OpenClaw: `sessions_spawn` with manual polling. |
| **🔧 Skills auto-loading** | Skills auto-selected by description match. OpenClaw: manual scan of `<available_skills>` list. |
| **🪝 Lifecycle hooks** | Rich hook system (SessionStart, Stop, PostToolUse, etc.). OpenClaw: limited hook support. |
| **📋 Scheduled tasks** | Desktop + Cloud scheduled tasks, `/loop` polling. OpenClaw: cron-only scheduling. |
| **🔒 Permission modes** | Granular: `default`, `plan`, `bypassPermissions` with per-tool allowlists. OpenClaw: binary policy. |
| **🏗️ Agent Teams** | Multi-agent coordination with shared context (experimental). OpenClaw: independent sub-agent sessions. |
| **📦 No infrastructure** | No gateway daemon, no config files, no port management. Just `claude` + workspace. |

### What OpenClaw Does Better

| Feature | Detail |
|---|---|
| **📡 Multi-channel** | Telegram, Discord, WhatsApp, Signal, Slack, iMessage, IRC, Google Chat — all native. Claudex: Telegram + Discord + iMessage only (via plugins). |
| **🏠 Paired nodes** | Camera/screen/location control on phones and other devices. Claudex: no equivalent. |
| **🌐 Browser control** | Dual mode: headless Playwright + live Chrome relay via extension. Claudex: Bash + Playwright only (no live browser relay). |
| **🎨 Canvas** | Render HTML/React UIs inline in chat. Claudex: no equivalent. |
| **📊 ClawHub** | Skill marketplace with `clawhub install/publish`. Claudex: manual skill management only. |
| **🔊 TTS** | Built-in `tts` tool + ElevenLabs integration. Claudex: needs MCP server or manual setup. |
| **💓 Heartbeat system** | Native heartbeat polling with `HEARTBEAT.md`. Claudex: approximated via scheduled tasks. |
| **🔄 Always-on guarantee** | Gateway daemon designed for 24/7 uptime. Claudex: sessions can timeout, need restart infrastructure. |
| **🖼️ Image analysis** | Native `image` tool with vision model. Claudex: via Bash + API or MCP. |
| **📨 Message tool** | Rich `message` tool with reactions, polls, buttons, effects. Claudex: basic send/receive. |
| **⚡ Session management** | `sessions_list`, `sessions_send`, `sessions_history` for cross-session communication. Claudex: independent sessions only. |
| **🔑 Secret management** | Built-in secret/token handling. Claudex: env vars + manual management. |

### What's Roughly Equivalent

| Feature | Notes |
|---|---|
| **Telegram messaging** | Both native, both work well. OpenClaw slightly richer (reactions, buttons, polls). |
| **Skills** | Both have skill systems. OpenClaw has 155 community skills via ClawHub; Claudex can port them. |
| **Memory** | Both file-based. OpenClaw: manual MEMORY.md. Claudex: auto-memory + daily files. |
| **Sub-agents** | Both spawn sub-agents. OpenClaw: `sessions_spawn`. Claudex: built-in subagents. |
| **GitHub integration** | Both use `gh` CLI. Claudex also supports MCP GitHub server. |
| **File operations** | Both: Read/Write/Edit/Exec. Identical capability. |
| **Web search** | Both supported. OpenClaw: built-in Brave API. Claudex: MCP or Bash. |
| **Systemd persistence** | Both use systemd. Claudex additionally has tmux + watchdog layers. |

### Bottom Line

**Choose Claudex if:** You want zero API cost, maximum context window (1M tokens), simple setup (no gateway/config), and you primarily use Telegram. Great for single-user autonomous agents.

**Choose OpenClaw if:** You need multi-channel support (WhatsApp, Discord, Signal, etc.), paired device control, browser relay, or the full ClawHub skill ecosystem. Better for complex multi-surface deployments.

**Use both:** They can coexist on the same machine — Claudex as the "always thinking" daemon with huge context, OpenClaw for its unique multi-channel and device capabilities. This is exactly what we do.

---

## Directory Structure

```
~/.claude-agent/                    # Agent workspace root
├── CLAUDE.md                       # Main instructions (soul + user + rules)
├── .claude/
│   ├── settings.json               # Permissions, hooks, env vars
│   ├── skills/                     # Skill modules
│   │   ├── weather/SKILL.md
│   │   ├── github-workflow/SKILL.md
│   │   ├── watchdog/SKILL.md
│   │   ├── web-monitor/SKILL.md
│   │   └── ... (155+ skills)
│   ├── agents/                     # Custom sub-agents
│   │   ├── researcher.md
│   │   ├── coder.md
│   │   ├── reviewer.md
│   │   ├── analyst.md
│   │   ├── sysadmin.md
│   │   └── writer.md
│   └── rules/                      # Global rules
│       ├── safety.md
│       └── telegram.md
├── memory/                         # Daily memory files
│   └── YYYY-MM-DD.md
├── logs/                           # Session and watchdog logs
├── scripts/                        # Management scripts
│   ├── start-claudex.sh
│   ├── stop-claudex.sh
│   ├── restart-claudex.sh
│   ├── status-claudex.sh
│   └── watchdog-claudex.sh
└── projects/                       # Symlinks to project directories
    ├── my-project -> ~/projects/my-project
    └── another-project -> ~/projects/another-project
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

---

## Examples

### Complete Workspace Example

See [examples/workspace/](examples/workspace/) for a sanitized version of a production Claudex setup with all components configured.

### Example Skills

See [examples/skills/](examples/skills/) for production-tested skills including:
- `weather` — fetch forecasts from wttr.in
- `github-workflow` — full git + GitHub operations
- `watchdog` — system health monitoring
- `web-monitor` — URL change detection with alerts
- `system-admin` — server management and diagnostics

### Example Sub-agents

See [examples/agents/](examples/agents/) for specialized sub-agent definitions.

---

## Origins

This system was built by Aksel Jansen ([@janseninvest](https://github.com/janseninvest)) with Kite (an OpenClaw-based AI agent) as a way to replicate and extend OpenClaw's autonomous agent capabilities using Claude Code's native features.

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
