#!/bin/bash
# Claudex Bootstrap Script
# Creates the full autonomous agent workspace from templates
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
USER_NAME="$(whoami)"

echo "╔══════════════════════════════════════════════╗"
echo "║        Claudex — Autonomous Agent Setup      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "This script will set up a Claude Code autonomous agent at:"
echo "  $WORKSPACE"
echo ""

# Choose communication channel. Honor a pre-set CLAUDEX_CHANNEL so this script can
# be driven non-interactively (e.g. matrix-setup.sh invokes it with CLAUDEX_CHANNEL=matrix).
if [ -n "${CLAUDEX_CHANNEL:-}" ]; then
    CHANNEL="$CLAUDEX_CHANNEL"
    echo "▸ Channel (preset): $CHANNEL"
else
    echo "▸ Which communication channel should the agent use?"
    echo "    1) Telegram  — official Claude Code plugin (needs Bun)"
    echo "    2) Matrix    — end-to-end encrypted (needs Python 3 + Rust to build the sidecar)"
    read -p "  Choose [1/2] (default 1): " -n 1 -r CH_CHOICE
    echo
    case "$CH_CHOICE" in
        2) CHANNEL=matrix ;;
        *) CHANNEL=telegram ;;
    esac
fi
echo "  → Channel: $CHANNEL"
echo ""

# Check prerequisites
echo "▸ Checking prerequisites..."

if ! command -v claude &>/dev/null; then
    echo "  ❌ Claude Code not found. Install it first:"
    echo "     curl -fsSL https://claude.ai/install.sh | bash"
    exit 1
fi
echo "  ✅ Claude Code: $(claude --version 2>/dev/null || echo 'installed')"

if [ "$CHANNEL" = "telegram" ]; then
    if ! command -v bun &>/dev/null; then
        echo "  ⚠️  Bun not found (required for Telegram plugin)"
        read -p "  Install Bun now? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            curl -fsSL https://bun.sh/install | bash
            export PATH="$HOME/.bun/bin:$PATH"
            echo "  ✅ Bun installed"
        else
            echo "  ⚠️  Skipping Bun — Telegram plugin won't work without it"
        fi
    else
        echo "  ✅ Bun: $(bun --version)"
    fi
else
    # Matrix channel: Python runs the bridge; Rust builds the E2EE sidecar.
    if command -v python3 &>/dev/null; then
        echo "  ✅ Python: $(python3 --version 2>&1)"
    else
        echo "  ⚠️  Python 3 not found — required to run the Matrix bridge"
    fi
    if command -v cargo &>/dev/null; then
        echo "  ✅ Rust/cargo: $(cargo --version 2>/dev/null || echo installed)"
    else
        echo "  ⚠️  cargo not found — needed to build matrix-sidecar (https://rustup.rs)"
    fi
fi

if ! command -v node &>/dev/null; then
    echo "  ⚠️  Node.js not found (recommended for MCP servers)"
else
    echo "  ✅ Node.js: $(node --version)"
fi

echo ""

# Create workspace
echo "▸ Creating workspace at $WORKSPACE..."
mkdir -p "$WORKSPACE"/{memory,logs,scripts,projects}
mkdir -p "$WORKSPACE/.claude"/{skills,agents,rules}

# Copy CLAUDE.md template
if [ ! -f "$WORKSPACE/CLAUDE.md" ]; then
    cp "$REPO_DIR/templates/CLAUDE.md.example" "$WORKSPACE/CLAUDE.md"
    echo "  ✅ CLAUDE.md template copied (customize it!)"
else
    echo "  ⚠️  CLAUDE.md already exists — skipping"
fi

# Copy settings.json
if [ ! -f "$WORKSPACE/.claude/settings.json" ]; then
    cp "$REPO_DIR/templates/settings.json" "$WORKSPACE/.claude/settings.json"
    echo "  ✅ settings.json copied (bypassPermissions — autonomous, no prompts)"
else
    echo "  ⚠️  settings.json already exists — skipping"
fi

# ─── Pre-approve bypass mode + workspace trust (zero-click autonomous start) ───
# bypassPermissions only runs prompt-free once two one-time gates are cleared:
#   A) ~/.claude/settings.json -> skipDangerousModePermissionPrompt  (accept bypass mode)
#   B) ~/.claude.json -> projects[<workspace>].hasTrustDialogAccepted (trust the dir)
# Without these, the FIRST start stops on an interactive prompt — fatal for a
# headless agent. We pre-seed both so a fresh install behaves like a long-running one.
echo ""
echo "▸ Pre-approving bypass mode + workspace trust (so the first start needs no clicks)..."
if command -v node &>/dev/null; then
    [ -f "$HOME/.claude/settings.json" ] && cp "$HOME/.claude/settings.json" "$HOME/.claude/settings.json.bak.$(date +%s)"
    [ -f "$HOME/.claude.json" ] && cp "$HOME/.claude.json" "$HOME/.claude.json.bak.$(date +%s)"
    WORKSPACE="$WORKSPACE" node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = process.env.WORKSPACE;

function mergeJson(file, mutate) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { data = {}; }
  mutate(data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// Gate A — accept bypassPermissions mode (global user settings)
mergeJson(path.join(os.homedir(), '.claude', 'settings.json'), d => {
  d.skipDangerousModePermissionPrompt = true;
});

// Gate B — trust the workspace directory (per-project entry in ~/.claude.json)
mergeJson(path.join(os.homedir(), '.claude.json'), d => {
  d.projects = d.projects || {};
  d.projects[ws] = d.projects[ws] || {};
  d.projects[ws].hasTrustDialogAccepted = true;
});
NODE
    echo "  ✅ bypass mode accepted   (~/.claude/settings.json: skipDangerousModePermissionPrompt)"
    echo "  ✅ workspace trusted      (~/.claude.json: projects[$WORKSPACE].hasTrustDialogAccepted)"
else
    echo "  ⚠️  node not found — cannot pre-approve. The FIRST start will prompt once to:"
    echo "       1) accept bypass-permissions mode, and 2) trust the workspace folder."
    echo "      Approve both once interactively; subsequent auto-restarts run prompt-free."
fi

# Copy example skills
echo "▸ Copying example skills..."
SKILL_COUNT=0
for skill_dir in "$REPO_DIR/skills"/*/; do
    skill_name=$(basename "$skill_dir")
    target="$WORKSPACE/.claude/skills/$skill_name"
    if [ ! -d "$target" ]; then
        mkdir -p "$target"
        cp "$skill_dir/SKILL.md" "$target/"
        SKILL_COUNT=$((SKILL_COUNT + 1))
    fi
done
echo "  ✅ $SKILL_COUNT skills installed"

# Copy sub-agents
echo "▸ Copying sub-agent definitions..."
AGENT_COUNT=0
for agent_file in "$REPO_DIR/agents"/*.md; do
    agent_name=$(basename "$agent_file")
    target="$WORKSPACE/.claude/agents/$agent_name"
    if [ ! -f "$target" ]; then
        cp "$agent_file" "$target"
        AGENT_COUNT=$((AGENT_COUNT + 1))
    fi
done
echo "  ✅ $AGENT_COUNT sub-agents installed"

# Copy rules
echo "▸ Copying rules..."
for rule_file in "$REPO_DIR/rules"/*.md; do
    rule_name=$(basename "$rule_file")
    target="$WORKSPACE/.claude/rules/$rule_name"
    if [ ! -f "$target" ]; then
        cp "$rule_file" "$target"
    fi
done
echo "  ✅ Rules installed"

# Copy management scripts
echo "▸ Installing management scripts..."
for script in start-claudex.sh stop-claudex.sh restart-claudex.sh status-claudex.sh watchdog-claudex.sh channel-config.sh; do
    if [ -f "$REPO_DIR/scripts/$script" ]; then
        cp "$REPO_DIR/scripts/$script" "$WORKSPACE/scripts/"
        chmod +x "$WORKSPACE/scripts/$script"
    fi
done
echo "  ✅ Management scripts installed"

# Record the chosen channel for the lifecycle scripts to read.
mkdir -p "$WORKSPACE/data"
echo "$CHANNEL" > "$WORKSPACE/data/channel"
echo "  ✅ Channel set to: $CHANNEL"

# Matrix channel: install the Python bridge, the guided installer, and the Rust sidecar source.
if [ "$CHANNEL" = "matrix" ]; then
    cp "$REPO_DIR/scripts/matrix-bridge.py" "$WORKSPACE/scripts/" && chmod +x "$WORKSPACE/scripts/matrix-bridge.py"
    cp "$REPO_DIR/scripts/matrix-setup.sh" "$WORKSPACE/scripts/" 2>/dev/null && chmod +x "$WORKSPACE/scripts/matrix-setup.sh" || true
    if [ -d "$REPO_DIR/matrix-sidecar" ]; then
        cp -r "$REPO_DIR/matrix-sidecar" "$WORKSPACE/"
        echo "  ✅ Matrix bridge + sidecar source installed"
        if command -v cargo &>/dev/null; then
            echo "  ▸ Building matrix-sidecar (cargo build --release)..."
            ( cd "$WORKSPACE/matrix-sidecar" && cargo build --release 2>&1 | tail -3 ) || \
                echo "  ⚠️  sidecar build failed — build it manually (see docs/matrix-setup.md)"
        else
            echo "  ⚠️  cargo missing — build the sidecar later: (cd $WORKSPACE/matrix-sidecar && cargo build --release)"
        fi
    fi
fi

# Systemd setup
echo ""
echo "▸ Setting up systemd service..."
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

# Generate systemd unit with correct paths
cat > "$SYSTEMD_DIR/claudex.service" << EOF
[Unit]
Description=Claudex - Claude Code Autonomous Agent ($CHANNEL)
After=network.target

# oneshot + RemainAfterExit: start-claudex.sh launches the agent into a detached
# tmux session and returns, so systemd must NOT treat that return as the service
# dying (Type=simple would restart-loop). The watchdog cron is the liveness keeper
# (it can restart from cron without a D-Bus session, which systemctl --user cannot);
# this unit just starts the agent once at boot/login.
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$WORKSPACE
ExecStart=$WORKSPACE/scripts/start-claudex.sh
Environment=HOME=$HOME
Environment=PATH=$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin
Environment=LANG=en_US.UTF-8
Environment=CLAUDEX_CHANNEL=$CHANNEL
StandardOutput=append:$WORKSPACE/logs/claudex-systemd.log
StandardError=append:$WORKSPACE/logs/claudex-systemd.log
KillMode=process
TimeoutStopSec=30

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
echo "  ✅ Systemd unit installed"

# Enable linger
if command -v loginctl &>/dev/null; then
    loginctl enable-linger "$USER_NAME" 2>/dev/null || true
    echo "  ✅ Linger enabled (survives logout)"
fi

# Watchdog cron
echo ""
echo "▸ Setting up watchdog cron..."
CRON_LINE="*/5 * * * * bash $WORKSPACE/scripts/watchdog-claudex.sh"
if crontab -l 2>/dev/null | grep -q "watchdog-claudex"; then
    echo "  ⚠️  Watchdog cron already exists — skipping"
else
    # `|| true`: on a fresh box with no crontab yet, `crontab -l` exits non-zero,
    # which under `set -euo pipefail` would abort the subshell before the echo and
    # kill bootstrap. Tolerate it so the new line is always appended.
    (crontab -l 2>/dev/null || true; echo "$CRON_LINE") | crontab -
    echo "  ✅ Watchdog cron installed (every 5 minutes)"
fi

# Memory search setup
echo ""
echo "▸ Setting up memory search (RAG system)..."
mkdir -p "$WORKSPACE/data"

# Copy memory search script
if [ -f "$REPO_DIR/scripts/memory-search.cjs" ]; then
    cp "$REPO_DIR/scripts/memory-search.cjs" "$WORKSPACE/scripts/"
    cp "$REPO_DIR/scripts/memory-reindex.sh" "$WORKSPACE/scripts/"
    chmod +x "$WORKSPACE/scripts/memory-reindex.sh"
    echo "  ✅ Memory search scripts installed"
fi

echo ""
echo "▸ Configuring embedding provider for RAG..."
echo "  The memory search system needs an embedding provider."
echo "  Options:"
echo "    1) OpenAI  — best quality, ~\$0.02/month (needs API key)"
echo "    2) Ollama  — local, free (needs Ollama installed)"
echo "    3) None    — skip RAG setup (can configure later)"
echo ""
# Non-interactive runs (e.g. driven by matrix-setup.sh) pick from CLAUDEX_EMBEDDING_PROVIDER.
if [ -n "${CLAUDEX_NONINTERACTIVE:-}" ]; then
    case "${CLAUDEX_EMBEDDING_PROVIDER:-none}" in
        openai) EMBED_CHOICE=1 ;;
        ollama) EMBED_CHOICE=2 ;;
        *)      EMBED_CHOICE=3 ;;
    esac
    echo "  (non-interactive) embedding provider: ${CLAUDEX_EMBEDDING_PROVIDER:-none}"
else
    read -p "  Choose [1/2/3]: " -n 1 -r EMBED_CHOICE
    echo ""
fi

case $EMBED_CHOICE in
  1)
    # Non-interactive runs take the key from the environment; interactive runs prompt.
    # Tolerate EOF so a piped/CI stdin can't abort the script under `set -e`.
    if [ -n "${CLAUDEX_NONINTERACTIVE:-}" ]; then
      OPENAI_KEY="${OPENAI_API_KEY:-}"
    else
      read -p "  Enter your OpenAI API key: " -r OPENAI_KEY || OPENAI_KEY=""
    fi
    if [ -n "$OPENAI_KEY" ]; then
      echo "OPENAI_API_KEY=$OPENAI_KEY" > "$WORKSPACE/.env"
      chmod 600 "$WORKSPACE/.env"
      echo "  ✅ OpenAI API key saved to $WORKSPACE/.env"

      # Source and run initial index
      export OPENAI_API_KEY="$OPENAI_KEY"
      if command -v node &>/dev/null; then
        echo "  ▸ Running initial memory index..."
        node --experimental-sqlite "$WORKSPACE/scripts/memory-search.cjs" --index 2>&1 | tail -3
        echo "  ✅ Initial index complete"
      fi
    fi
    ;;
  2)
    if command -v ollama &>/dev/null; then
      echo "  ✅ Ollama found"
      echo "  ▸ Pulling nomic-embed-text model..."
      ollama pull nomic-embed-text 2>&1 | tail -1
      echo "CLAUDEX_EMBEDDING_PROVIDER=ollama" > "$WORKSPACE/.env"
      chmod 600 "$WORKSPACE/.env"
      echo "  ✅ Ollama embedding configured"
    else
      echo "  ❌ Ollama not installed. Install from https://ollama.ai"
      echo "     Then run: ollama pull nomic-embed-text"
      echo "     And set CLAUDEX_EMBEDDING_PROVIDER=ollama in $WORKSPACE/.env"
    fi
    ;;
  3)
    echo "  ⚠️  RAG skipped. You can set up later — see docs/memory-search.md"
    ;;
esac

# Memory reindex cron (every 30 min)
REINDEX_CRON="*/30 * * * * bash $WORKSPACE/scripts/memory-reindex.sh"
if crontab -l 2>/dev/null | grep -q "memory-reindex"; then
    echo "  ⚠️  Reindex cron already exists — skipping"
else
    # `|| true`: see the watchdog cron above — empty crontab + `set -e` would abort.
    (crontab -l 2>/dev/null || true; echo "$REINDEX_CRON") | crontab -
    echo "  ✅ Memory reindex cron installed (every 30 minutes)"
fi

echo ""
echo "  ℹ️  Memory search supports OpenAI, Ollama, or TF-IDF embeddings."
echo "     See docs/memory-search.md for configuration options."
echo ""

# Channel-specific setup
echo ""
if [ "$CHANNEL" = "telegram" ]; then
    echo "╔══════════════════════════════════════════════╗"
    echo "║            Telegram Setup                    ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    echo "To connect to Telegram:"
    echo ""
    echo "  1. Create a bot via @BotFather on Telegram"
    echo "  2. Start Claude Code interactively:"
    echo "     cd $WORKSPACE"
    echo "     claude --channels plugin:telegram@claude-plugins-official \\"
    echo "            --dangerously-skip-permissions"
    echo ""
    echo "  3. In Claude Code, run:"
    echo "     /plugin install telegram@claude-plugins-official"
    echo "     /telegram:configure <your-bot-token>"
    echo ""
    echo "  4. Send a message to your bot on Telegram"
    echo "  5. Pair your account:"
    echo "     /telegram:access pair <code>"
    echo "  6. Lock down access:"
    echo "     /telegram:access policy allowlist"
    echo ""
elif [ -n "${CLAUDEX_FROM_MATRIX_SETUP:-}" ]; then
    # Invoked by matrix-setup.sh — it orchestrates login/verify/services itself.
    echo "▸ Matrix workspace ready (matrix-setup.sh is orchestrating the rest)."
else
    echo "╔══════════════════════════════════════════════╗"
    echo "║            Matrix Setup (E2EE)               ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    echo "One guided installer finishes everything (login, verify, pin, services):"
    echo "    bash $REPO_DIR/scripts/matrix-setup.sh"
    echo ""
    echo "It installs prerequisites, authenticates Claude, logs the bot in, pins your"
    echo "cross-signing key, writes the allowlist, and starts the sidecar + bridge."
    echo "Full reference + troubleshooting: docs/matrix-setup.md"
    echo ""
    if [ -t 0 ]; then
        read -p "  Run the guided Matrix setup now? [Y/n] " -n 1 -r RUNIT; echo
        if [[ $RUNIT =~ ^[Yy]$ ]] || [[ -z $RUNIT ]]; then
            exec bash "$REPO_DIR/scripts/matrix-setup.sh"
        fi
    fi
fi

# Summary
echo "╔══════════════════════════════════════════════╗"
echo "║            Setup Complete! ✅                ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Workspace:   $WORKSPACE"
echo "Skills:      $SKILL_COUNT installed"
echo "Sub-agents:  $AGENT_COUNT installed"
echo "Systemd:     Installed (not started)"
echo "Watchdog:    Cron installed"
echo ""
echo "Next steps:"
echo "  1. Edit $WORKSPACE/CLAUDE.md with your identity"
echo "  2. Set up your channel: $CHANNEL (see instructions above)"
echo "  3. Start: systemctl --user start claudex"
echo "     Or:    bash $WORKSPACE/scripts/start-claudex.sh"
echo ""
echo "Management:"
echo "  Status:    bash $WORKSPACE/scripts/status-claudex.sh"
echo "  Stop:      bash $WORKSPACE/scripts/stop-claudex.sh"
echo "  Restart:   bash $WORKSPACE/scripts/restart-claudex.sh"
echo "  Logs:      tail -f $WORKSPACE/logs/"
echo ""
echo "📖 Full documentation: https://github.com/JansenAnalytics/claudex"
