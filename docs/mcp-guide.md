# MCP Guide (Claudex)

How Model Context Protocol servers are wired into the Claudex workspace, and how
to add, authenticate, and verify one. The full server catalog lives in
[`mcp/registry.md`](../mcp/registry.md) — this doc is the *how*, the registry is
the *what*.

## What MCP is

The **Model Context Protocol** is a standard way to expose extra tools,
resources, and prompts to Claude Code from a separate process (a "server"). Each
server adds a batch of tools that show up alongside the built-in ones — e.g. a
`github` server gives Claude repo/issue/PR tools, a `sqlite` server gives it SQL
query tools, a `filesystem` server gives sandboxed file ops.

Servers talk to Claude Code over a **transport**. Everything in our catalog uses
**stdio** (Claude Code spawns the server as a child process and pipes JSON-RPC
over stdin/stdout). Remote servers can instead use **http** — see the registry's
runtime notes for that fragment shape.

## How Claude Code loads `.mcp.json`

Claude Code reads MCP servers from `.mcp.json` at the workspace root:

```
$HOME/.claude-agent/.mcp.json
```

Shape:

```json
{ "mcpServers": { "<name>": { "command": "...", "args": [...], "env": {...} } } }
```

**Our `.mcp.json` ships empty** — literally `{"mcpServers": {}}`. Nothing is
loaded by default; **every server is opt-in**. You install the ones you want, and
they take effect on the next Claude Code start.

Claude Code reads this file **at startup only**. Editing `.mcp.json` (or running
the installer) does *not* hot-reload — you must **restart Claude Code** for a new
or changed server to appear.

## Adding a server

Each catalog entry has a config fragment at `mcp/configs/<name>.json` (a tiny
`{"mcpServers": {...}}` snippet). Install merges it into the live `.mcp.json`:

```bash
bash mcp/install.sh <name>     # deep-merge configs/<name>.json into .mcp.json
bash mcp/install.sh --list     # list available config names
bash mcp/install.sh --help     # usage
```

What the installer does:
- Validates the fragment is real JSON before touching anything.
- Creates `.mcp.json` with `{"mcpServers": {}}` if it doesn't exist yet.
- **Backs up** the current `.mcp.json` to `.mcp.json.bak.<timestamp>` first.
- **Deep-merges** *only* the server(s) in the fragment — it never clobbers other
  already-installed servers. Re-installing the same name overwrites just that one
  entry (idempotent), printing `updated: <name> (overwrote existing entry)`.

Override the target file with `MCP_TARGET=/path/to/.mcp.json` if needed.

Available fragments today (run `--list` for the live set):
`everything`, `fetch`, `filesystem`, `github`, `memory`, `postgres`,
`puppeteer`, `sequential-thinking`, `slack`, `sqlite`, `time`.

After installing: set any required env vars (below), then **restart Claude Code**.

## Auth patterns

Three flavors, by server:

- **None** — no credentials. Access is scoped by path or it's a pure-compute
  server. Covers `filesystem` (sandboxed to the dirs in its args), `sqlite`,
  `puppeteer`, `fetch`, `memory`, `sequential-thinking`, `time`, `everything`.
  Just install and restart.

- **Env var** — the fragment references `${VAR}` placeholders; the value comes
  from the environment, never the file. Set the var before launching Claude Code:
  - `github` → `GITHUB_PERSONAL_ACCESS_TOKEN`
  - `slack` → `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID`
  - `postgres` → `POSTGRES_CONNECTION_STRING` (passed as an arg; holds credentials)

  Secrets live in `~/.claude-agent/.env`. Load one into the session with:
  ```bash
  export GITHUB_PERSONAL_ACCESS_TOKEN="$(grep GITHUB_PERSONAL_ACCESS_TOKEN ~/.claude-agent/.env | cut -d= -f2-)"
  ```
  **Never hardcode a token into a config fragment** — keep the `${VAR}` form so
  nothing secret lands in a committed file.

- **OAuth** — some remote/HTTP servers do an interactive OAuth handshake instead
  of a static token (you authenticate once, the server holds the session). None
  of our local stdio catalog uses this; it applies to hosted `type: http` servers
  you might add. For those the fragment carries a `url` and no `env` secret —
  the auth happens at the server, not in `.mcp.json`.

## Verifying a server loaded

1. **Restart Claude Code** — required; it only reads `.mcp.json` at startup.
2. Confirm the merge landed:
   ```bash
   bash mcp/install.sh --list                          # fragment is available
   python3 -m json.tool $HOME/.claude-agent/.mcp.json   # server is now in the live file
   ```
3. In the new session, check the server's tools are present — MCP tools are named
   `mcp__<server>__<tool>` (e.g. `mcp__github__search_repositories`). If you can
   call one, it loaded.
4. **If it didn't load**, the usual causes:
   - Forgot to restart Claude Code.
   - Required env var unset (server starts but its API calls fail auth) — re-check
     the `export` and that the var is in the launching shell.
   - Runtime missing: npx servers (`-y @modelcontextprotocol/server-*`) need Node
     (v22 here, first run downloads the package); `fetch` and `time` need `uvx`
     (install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`).
   - Roll back if the file got mangled: restore the newest `.mcp.json.bak.*`.

## See also

- [`mcp/registry.md`](../mcp/registry.md) — full catalog: what each server does,
  its transport, auth, package, and per-server notes.
- `mcp/configs/*.json` — the actual fragments the installer merges.
- `mcp/install.sh` — the merge script (idempotent, backs up, deep-merges).
