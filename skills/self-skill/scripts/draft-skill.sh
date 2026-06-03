#!/usr/bin/env bash
# draft-skill — scaffold a new skill from name + description
#
# Usage:
#   bash draft-skill.sh <skill-name> [--desc "what it does"] [--resources "scripts,references"]
#
# Creates:
#   $HOME/openclaw/skills/<skill-name>/
#     SKILL.md       (pre-filled with name, description, trigger phrases template)
#     scripts/       (if requested)
#     references/    (if requested)
#
# After running: fill in SKILL.md, add scripts, write the guide.

set -euo pipefail

SKILLS_DIR="$HOME/openclaw/skills"
WORKSPACE="$HOME/.openclaw/workspace"
INIT_SCRIPT="${SKILLS_DIR}/skill-creator/scripts/init_skill.py"

NAME=""
DESC=""
RESOURCES="scripts,references"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --desc)      DESC="$2"; shift 2 ;;
    --resources) RESOURCES="$2"; shift 2 ;;
    --*)         echo "Unknown: $1"; exit 1 ;;
    *)           NAME="$1"; shift ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "Usage: bash draft-skill.sh <skill-name> [--desc \"description\"] [--resources \"scripts,references\"]"
  exit 1
fi

if [[ -d "${SKILLS_DIR}/${NAME}" ]]; then
  echo "[!] Skill '${NAME}' already exists at ${SKILLS_DIR}/${NAME}"
  echo "    Delete it first or choose a different name."
  exit 1
fi

# Init structure (capture normalized name from output)
INIT_OUTPUT=$(python3 "$INIT_SCRIPT" "$NAME" \
  --path "$SKILLS_DIR" \
  --resources "$RESOURCES" 2>&1)
echo "$INIT_OUTPUT"

# Detect normalized name (init script may strip leading underscores etc.)
NORMALIZED=$(echo "$INIT_OUTPUT" | grep "Created skill directory:" | sed "s|.*${SKILLS_DIR}/||")
SKILL_DIR="${SKILLS_DIR}/${NORMALIZED:-$NAME}"

# Pre-fill SKILL.md with description if provided
if [[ -n "$DESC" && -f "${SKILL_DIR}/SKILL.md" ]]; then
  python3 - "${SKILL_DIR}/SKILL.md" "$DESC" << 'EOF'
import sys, re
path, desc = sys.argv[1], sys.argv[2]
content = open(path).read()
pattern = r'\[TODO: Complete and informative explanation.*?it\.\]'
updated = re.sub(pattern, desc, content, flags=re.DOTALL)
open(path, 'w').write(updated)
EOF
  echo "[✓] Description pre-filled"
fi

FINAL_NAME="${NORMALIZED:-$NAME}"
echo ""
echo "=== Skill '${FINAL_NAME}' scaffolded ==="
echo "Location: ${SKILL_DIR}"
echo ""
echo "Next steps:"
echo "  1. Edit ${SKILL_DIR}/SKILL.md"
echo "  2. Add scripts to ${SKILL_DIR}/scripts/"
echo "  3. Add references to ${SKILL_DIR}/references/"
echo "  4. Write ${WORKSPACE}/${FINAL_NAME}-guide.md"
echo "  5. Send guide via Telegram + paste raw markdown in chat"
echo "  6. git add -A && git commit -m 'feat: add ${FINAL_NAME} skill'"
