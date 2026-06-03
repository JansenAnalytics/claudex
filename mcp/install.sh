#!/usr/bin/env bash
# install.sh — merge an MCP server config fragment into the workspace .mcp.json
#
#   bash mcp/install.sh <name>     # deep-merge mcp/configs/<name>.json into .mcp.json
#   bash mcp/install.sh --list     # list available config names
#   bash mcp/install.sh --help     # usage
#
# Idempotent. Backs up the existing .mcp.json before writing. Never clobbers
# other already-installed servers (deep-merge of mcpServers only).
set -euo pipefail

MCP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS_DIR="$MCP_DIR/configs"
TARGET="${MCP_TARGET:-$HOME/.claude-agent/.mcp.json}"

usage() {
  cat <<'EOF'
Usage:
  bash mcp/install.sh <name>     Install/merge the named MCP server into .mcp.json
  bash mcp/install.sh --list     List available config names
  bash mcp/install.sh --help     Show this help

Target .mcp.json defaults to $HOME/.claude-agent/.mcp.json
(override with MCP_TARGET=/path/to/.mcp.json).

After installing, set any required env vars (see mcp/registry.md) and restart
Claude Code so it picks up the new server.
EOF
}

list_configs() {
  echo "Available MCP configs in $CONFIGS_DIR:"
  local found=0
  for f in "$CONFIGS_DIR"/*.json; do
    [ -e "$f" ] || continue
    found=1
    printf '  %s\n' "$(basename "$f" .json)"
  done
  [ "$found" -eq 1 ] || echo "  (none)"
}

case "${1:-}" in
  ""|-h|--help)
    usage
    exit 0
    ;;
  --list|-l)
    list_configs
    exit 0
    ;;
esac

NAME="$1"
FRAGMENT="$CONFIGS_DIR/$NAME.json"

if [ ! -f "$FRAGMENT" ]; then
  echo "ERROR: no config named '$NAME' (looked for $FRAGMENT)" >&2
  echo "Run: bash mcp/install.sh --list" >&2
  exit 1
fi

# Validate the fragment is parseable JSON before touching anything.
if ! python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$FRAGMENT" 2>/dev/null; then
  echo "ERROR: $FRAGMENT is not valid JSON" >&2
  exit 1
fi

# Ensure the target exists with the expected skeleton.
if [ ! -f "$TARGET" ]; then
  echo '{"mcpServers": {}}' > "$TARGET"
  echo "created $TARGET"
fi

# Back up the existing target before mutating.
BACKUP="$TARGET.bak.$(date +%Y%m%d-%H%M%S)"
cp "$TARGET" "$BACKUP"
echo "backup -> $BACKUP"

# Deep-merge: add/replace only the server(s) defined in the fragment,
# preserving every other key and any already-installed servers.
python3 - "$TARGET" "$FRAGMENT" "$NAME" <<'PY'
import json, sys

target_path, fragment_path, name = sys.argv[1], sys.argv[2], sys.argv[3]

with open(target_path) as f:
    target = json.load(f)
with open(fragment_path) as f:
    fragment = json.load(f)

if not isinstance(target, dict):
    print(f"ERROR: {target_path} is not a JSON object", file=sys.stderr)
    sys.exit(1)

target.setdefault("mcpServers", {})
frag_servers = fragment.get("mcpServers", {})

if not frag_servers:
    print(f"ERROR: fragment defines no mcpServers", file=sys.stderr)
    sys.exit(1)

added, updated = [], []
for key, val in frag_servers.items():
    if key in target["mcpServers"]:
        updated.append(key)
    else:
        added.append(key)
    target["mcpServers"][key] = val

with open(target_path, "w") as f:
    json.dump(target, f, indent=2)
    f.write("\n")

for k in added:
    print(f"installed: {k}")
for k in updated:
    print(f"updated:   {k} (overwrote existing entry)")
PY

echo "OK — '$NAME' merged into $TARGET"
echo "Set required env vars (see mcp/registry.md), then restart Claude Code."
exit 0
