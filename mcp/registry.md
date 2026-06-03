# MCP Server Registry

Curated catalog of Model Context Protocol servers for the Claudex workspace.
Everything here is **opt-in** — the live `.mcp.json` stays empty until you install.

Claude Code reads MCP servers from `.mcp.json` (`{"mcpServers": {...}}`) at
`$HOME/.claude-agent/.mcp.json`. To enable one:

```bash
bash mcp/install.sh <name>      # deep-merge configs/<name>.json into .mcp.json
bash mcp/install.sh --list      # list available config names
bash mcp/install.sh --help      # usage
```

The installer backs up `.mcp.json` first and never clobbers other servers.
After installing, export any required env vars (below) and **restart Claude Code**.

`.env` lives at `~/.claude-agent/.env`. Load a var into the session with:
`export VAR="$(grep VAR ~/.claude-agent/.env | cut -d= -f2-)"`
Never hardcode tokens into the config files — they use `${VAR}` placeholders.

---

## Catalog

### filesystem — `@modelcontextprotocol/server-filesystem`
- **Does:** Read/write/search files within whitelisted roots. Sandboxed to the
  dirs passed as args (defaults: `~/.claude-agent`, `~/projects`).
- **Transport:** stdio · **Auth:** none (path-scoped)
- **Install:** `bash mcp/install.sh filesystem`

### github — `@modelcontextprotocol/server-github`
- **Does:** Repos, issues, PRs, commits, code search, file contents via GitHub API.
- **Transport:** stdio · **Auth:** **env var** `GITHUB_PERSONAL_ACCESS_TOKEN` (PAT, required)
- **Install:** `bash mcp/install.sh github`
- the user's fine-grained PAT (repo/PR/workflow) already exists for `gh`; reuse it.

### postgres — `@modelcontextprotocol/server-postgres`
- **Does:** Read-only SQL queries + schema inspection against a Postgres DB.
- **Transport:** stdio · **Auth:** **connection string** `POSTGRES_CONNECTION_STRING`
  (required, passed as an arg; contains credentials)
- **Install:** `bash mcp/install.sh postgres`

### sqlite — `@modelcontextprotocol/server-sqlite`
- **Does:** Query/inspect a SQLite DB file. Set `SQLITE_DB_PATH` to the DB you
  want (the config uses `--db-path ${SQLITE_DB_PATH}`).
- **Transport:** stdio · **Auth:** none (local file path; set `SQLITE_DB_PATH`)
- **Install:** `bash mcp/install.sh sqlite`

### slack — `@modelcontextprotocol/server-slack`
- **Does:** List channels, read history, post messages, manage Slack workspace.
- **Transport:** stdio · **Auth:** **env vars** `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID` (both required)
- **Install:** `bash mcp/install.sh slack`

### puppeteer — `@modelcontextprotocol/server-puppeteer`
- **Does:** Headless-Chromium browser automation — navigate, click, fill, screenshot,
  scrape rendered JS. (Playwright is a heavier alternative with the same role.)
- **Transport:** stdio · **Auth:** none
- **Install:** `bash mcp/install.sh puppeteer`

### fetch — `mcp-server-fetch` (uvx / Python)
- **Does:** Fetch a URL and return clean Markdown — lightweight web reads without a browser.
- **Transport:** stdio · **Auth:** none · **Runtime:** needs `uvx` (uv) installed
- **Install:** `bash mcp/install.sh fetch`

### memory — `@modelcontextprotocol/server-memory`
- **Does:** Persistent knowledge-graph memory (entities + relations + observations),
  stored at `~/.claude-agent/mcp/data/memory-graph.json`. Separate from the RAG
  memory-search system — this is structured graph recall.
- **Transport:** stdio · **Auth:** none (local file; `MEMORY_FILE_PATH` set in config)
- **Install:** `bash mcp/install.sh memory`

### sequential-thinking — `@modelcontextprotocol/server-sequential-thinking`
- **Does:** Structured step-by-step reasoning scratchpad with branching/revision.
- **Transport:** stdio · **Auth:** none
- **Install:** `bash mcp/install.sh sequential-thinking`

### time — `mcp-server-time` (uvx / Python)
- **Does:** Current time + timezone conversion. Config pins `--local-timezone Europe/Oslo`.
- **Transport:** stdio · **Auth:** none · **Runtime:** needs `uvx` (uv) installed
- **Install:** `bash mcp/install.sh time`

### everything — `@modelcontextprotocol/server-everything`
- **Does:** Reference/demo server exercising every MCP feature (tools, prompts,
  resources, sampling). Use for testing the MCP wiring, not for real work.
- **Transport:** stdio · **Auth:** none
- **Install:** `bash mcp/install.sh everything`

---

## Needs credentials (set before/after install)
- **github** → `GITHUB_PERSONAL_ACCESS_TOKEN`
- **postgres** → `POSTGRES_CONNECTION_STRING`
- **slack** → `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`

## Needs no credentials
filesystem · sqlite · puppeteer · fetch · memory · sequential-thinking · time · everything

## Runtime notes
- npx-based servers (`-y @modelcontextprotocol/server-*`) need Node (v22 here) — first run downloads the package.
- `fetch` and `time` use `uvx` (Python/uv). Install uv if missing: `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- Transports here are all **stdio**. For a remote HTTP server, the fragment shape is
  `{"mcpServers": {"<name>": {"type": "http", "url": "https://..."}}}` — drop one in `configs/` and install the same way.
