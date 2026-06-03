# Install: data-validator

This skill runs on Node.js built-in modules only, **except** when validating
SQLite sources, which need the `better-sqlite3` native module.

## Prerequisites
- Node.js 22+
- (SQLite sources only) `better-sqlite3`

## Setup
The skill's scripts (`review.cjs`, `report.cjs`, etc.) live in this skill's own
`scripts/` directory and need no install for CSV/JSON/NDJSON/API sources.

For SQLite validation, `better-sqlite3` is shared from the `kanban-agent` skill,
which already vendors it:

```bash
# better-sqlite3 is resolved from the sibling kanban-agent skill:
SKILLS="${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}"
ls "$SKILLS/kanban-agent/node_modules/better-sqlite3" >/dev/null && echo "ok"
```

If that module is missing, install it once in the kanban-agent skill:

```bash
cd "${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/kanban-agent" && npm install better-sqlite3
```

## Verification
```bash
node "${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/data-validator/scripts/review.cjs" --help
```
