---
name: shared-clipboard
description: Cross-session key-value clipboard for sharing snippets, code, URLs, configs, and notes between agents, sessions, and devices. Use when storing, retrieving, or sharing text snippets, when piping data between commands, or when the user says "save this", "remember this snippet", "clipboard", "clip", or "scratchpad".
triggers:
  - clipboard
  - clip set
  - clip get
  - save snippet
  - scratchpad
  - share between sessions
  - remember this code
  - store this value
---

# Shared Clipboard

Cross-session key-value snippet store. Share text, code, URLs, configs, SQL queries, and notes between agents, sessions, devices, and humans.

**Binary:** `~/bin/clip` (or `node ~/openclaw/skills/shared-clipboard/scripts/clip.cjs`)
**Database:** `~/.clipboard/clips.db` (SQLite)

## Quick Reference

```bash
# Store and retrieve
clip set mykey "some value"
clip get mykey

# With tags for organization
clip set db-conn "postgres://user:pass@host/db" --tag config,secrets
clip set deploy-cmd "docker compose up -d" --tag commands,prod

# Pipe in/out (stdin/stdout)
echo "complex value" | clip set mykey
clip get mykey | pbcopy          # or pipe to any command
cat query.sql | clip set last-query --tag sql

# List and search
clip list                        # all clips, most recent first
clip list --tag config           # filter by tag
clip list --search postgres      # search keys + values
clip tags                        # list all tags with counts

# Stack (anonymous, LIFO)
clip push "quick thought"
clip peek                        # view without removing
clip pop                         # retrieve and remove
```

## All Commands

### Core Operations

| Command | Description |
|---------|-------------|
| `clip set <key> <value>` | Store a value. Pipe stdin if no value arg. Auto-detects content type. |
| `clip get <key>` | Retrieve value. Raw output (pipeable). Fuzzy-matches if key not found. |
| `clip del <key>` | Delete a key (fails if pinned). |
| `clip append <key> <value>` | Append text to existing clip (newline-separated). |

### Organization

| Command | Description |
|---------|-------------|
| `clip list [--tag T] [--search Q] [--all]` | List clips with optional filters. |
| `clip tags` | Show all tags with counts. |
| `clip pin <key>` | Pin clip (protects from garbage collection). |
| `clip unpin <key>` | Remove pin. |

### Stack (Anonymous LIFO)

| Command | Description |
|---------|-------------|
| `clip push <value>` | Push onto anonymous stack. |
| `clip pop` | Pop most recent stack item (removes it). |
| `clip peek` | View top of stack without removing. |

### Versioning

| Command | Description |
|---------|-------------|
| `clip history <key>` | Show all versions of a key. |
| `clip diff <key1> <key2>` | Line-by-line diff between two clips. |

### Sharing & Export

| Command | Description |
|---------|-------------|
| `clip share <key>` | Pretty-print with metadata (for pasting in chat). |
| `clip export [--format json\|csv\|md] [--tag T]` | Export all clips. |
| `clip import <file.json>` | Import from JSON export. |
| `clip copy <from> <to>` | Duplicate a clip under new key. |
| `clip rename <old> <new>` | Rename a key. |

### Maintenance

| Command | Description |
|---------|-------------|
| `clip stats` | Usage statistics (counts, sizes, top accessed). |
| `clip gc [--older-than 30d]` | Delete old unpinned clips. |

## Features

### Auto Content-Type Detection
When you `set` a value, the clipboard auto-detects its type:

| Type | Detection |
|------|-----------|
| `json` | Valid JSON objects/arrays |
| `url` | Starts with http:// or https:// |
| `code` | Starts with import/const/def/class/etc. |
| `sql` | Starts with SELECT/INSERT/UPDATE/etc. |
| `command` | Starts with curl/docker/git/npm/etc. |
| `path` | Filesystem path |
| `multiline` | 5+ lines of text |
| `text` | Default |

### Version History
Every `set` to an existing key saves the previous value in history:
```bash
clip set config '{"port": 3000}'
clip set config '{"port": 8080}'     # v1 saved to history
clip history config                   # shows all versions
```

### Tagging System
Organize clips with comma-separated tags:
```bash
clip set prod-url "https://prod.example.com" --tag urls,production
clip set staging-url "https://staging.example.com" --tag urls,staging
clip list --tag urls                  # both appear
clip list --tag production            # only prod
clip tags                             # shows: urls (2), production (1), staging (1)
```

### Piping Support
`get` outputs raw value to stdout — perfect for piping:
```bash
# Use clip as a command pipeline store
clip get sql-query | sqlite3 mydb.db
clip get ssh-cmd | bash
clip get json-data | jq '.items[0]'

# Store command output
ls -la | clip set dir-listing
git diff | clip set last-diff --tag git
curl -s https://api.example.com/status | clip set api-status --tag monitoring
```

### Garbage Collection
Pinned clips survive forever. Unpinned clips can be cleaned:
```bash
clip pin important-key               # protect from gc
clip gc --older-than 7d              # delete unpinned clips older than 7 days
clip gc --older-than 24h             # aggressive cleanup
```

## Agent Usage Patterns

### Sharing data between sessions
```bash
# Session 1 (Poe): save analysis results
clip set forex-summary "CPI inline 0.2%, NFP tomorrow 13:30 CET" --tag forex,daily

# Session 2 (Kite): retrieve
clip get forex-summary
```

### Storing intermediate results during work
```bash
# During a complex task, save checkpoints
clip set step1-result "$(python3 analyze.py data.csv)"
clip set step2-result "$(node transform.cjs)"
# Later, combine
clip get step1-result > /tmp/step1.txt
```

### Quick notes from user
When user says "remember this" or "save this":
```bash
clip set <descriptive-key> "user's text" --tag notes
```

### Config sharing
```bash
clip set db-host "localhost:5432" --tag config
clip set redis-url "redis://localhost:6379" --tag config
clip list --tag config    # see all config snippets
```

### Code snippet library
```bash
clip set boilerplate-express "const app = express();\napp.get('/', (req, res) => res.json({ok:true}));" --tag code,node
clip set sql-top-errors "SELECT message, count(*) FROM events WHERE type='error' GROUP BY message ORDER BY count(*) DESC LIMIT 10" --tag sql
```
