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

# Check prerequisites
echo "▸ Checking prerequisites..."

if ! command -v claude &>/dev/null; then
    echo "  ❌ Claude Code not found. Install it first:"
    echo "     curl -fsSL https://claude.ai/install.sh | bash"
    exit 1
fi
echo "  ✅ Claude Code: $(claude --version 2>/dev/null || echo 'installed')"

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
    echo "  ✅ settings.json copied"
else
    echo "  ⚠️  settings.json already exists — skipping"
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
for script in start-claudex.sh stop-claudex.sh restart-claudex.sh status-claudex.sh watchdog-claudex.sh; do
    if [ -f "$REPO_DIR/scripts/$script" ]; then
        cp "$REPO_DIR/scripts/$script" "$WORKSPACE/scripts/"
        chmod +x "$WORKSPACE/scripts/$script"
    fi
done
echo "  ✅ Management scripts installed"

# Systemd setup
echo ""
echo "▸ Setting up systemd service..."
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

# Generate systemd unit with correct paths
cat > "$SYSTEMD_DIR/claudex.service" << EOF
[Unit]
Description=Claudex - Claude Code Autonomous Agent (Telegram)
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORKSPACE
ExecStart=$WORKSPACE/scripts/start-claudex.sh
Restart=on-failure
RestartSec=30
Environment=HOME=$HOME
Environment=PATH=$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin
Environment=LANG=en_US.UTF-8
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
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
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
read -p "  Choose [1/2/3]: " -n 1 -r EMBED_CHOICE
echo ""

case $EMBED_CHOICE in
  1)
    read -p "  Enter your OpenAI API key: " -r OPENAI_KEY
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
    (crontab -l 2>/dev/null; echo "$REINDEX_CRON") | crontab -
    echo "  ✅ Memory reindex cron installed (every 30 minutes)"
fi

echo ""
echo "  ℹ️  Memory search supports OpenAI, Ollama, or TF-IDF embeddings."
echo "     See docs/memory-search.md for configuration options."
echo ""

# Telegram setup
echo ""
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
echo "  2. Set up Telegram (see instructions above)"
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
