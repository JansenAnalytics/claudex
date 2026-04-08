# MCP Servers — Extending Claude Code with External Tools

MCP (Model Context Protocol) lets Claude Code reach beyond its built-in capabilities by connecting to external tool servers. Think of it as a plugin system: each server exposes a set of tools Claude can call during a session.

---

## What MCP Is

MCP is an open protocol for defining tool servers that any compatible AI agent can talk to. In Claude Code, MCP servers are spawned as child processes (stdio) or reached over HTTP, and their tools appear alongside Claude's native capabilities.

Use MCP when you need Claude to:
- Access files outside its workspace
- Call third-party APIs (GitHub, Brave, etc.)
- Persist data between sessions
- Fetch arbitrary web content

---

## Configuration

MCP servers are declared in `.mcp.json` at the workspace root (or a path you specify with `--mcp-config`).

```
~/your-workspace/
└── .mcp.json   ← Claude reads this at startup
```

Each entry names a server and tells Claude how to launch or reach it, plus any environment variables it needs.

---

## Recommended Servers

### `@anthropic/mcp-filesystem`
Grants read/write access to directories outside the workspace. Useful when your projects live in multiple locations or you need access to system config files.

```json
"filesystem": {
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-filesystem", "/home/you", "/mnt/data"],
  "type": "stdio"
}
```
Pass the directories you want accessible as positional arguments.

### `@anthropic/mcp-github`
GitHub API access — list issues, read PRs, search repos, post comments. Requires a personal access token.

```json
"github": {
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-github"],
  "type": "stdio",
  "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
}
```

### `@anthropic/mcp-brave-search`
Web search via Brave's API. Useful for research tasks, checking current docs, or finding examples without switching context.

```json
"brave-search": {
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-brave-search"],
  "type": "stdio",
  "env": { "BRAVE_API_KEY": "${BRAVE_API_KEY}" }
}
```

### `@anthropic/mcp-memory`
Persistent key-value memory backed by a JSON file. Lets Claude store facts, preferences, or project state across sessions — great for long-running projects.

```json
"memory": {
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-memory", "--path", "/home/you/.claude-memory.json"],
  "type": "stdio"
}
```

### `@anthropic/mcp-fetch`
HTTP fetching — GET any URL and get back text or JSON. Good for reading API docs, pulling data from internal services, or scraping pages.

```json
"fetch": {
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-fetch"],
  "type": "stdio"
}
```

---

## Complete `.mcp.json` Example

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-filesystem", "/home/you", "/mnt/data"],
      "type": "stdio"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-github"],
      "type": "stdio",
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-brave-search"],
      "type": "stdio",
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-memory", "--path", "/home/you/.claude-memory.json"],
      "type": "stdio"
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-fetch"],
      "type": "stdio"
    }
  }
}
```

---

## Custom MCP Servers

You can add any MCP-compatible server — your own or third-party.

**stdio server** (subprocess, most common):
```json
"my-tool": {
  "command": "node",
  "args": ["/home/you/tools/my-mcp-server.js"],
  "type": "stdio",
  "env": { "MY_API_KEY": "${MY_API_KEY}" }
}
```

**HTTP server** (remote or local daemon):
```json
"my-remote-tool": {
  "url": "http://localhost:4000/mcp",
  "type": "http"
}
```

To build your own stdio server, implement the MCP spec: accept JSON-RPC on stdin, respond on stdout. The spec is at [modelcontextprotocol.io](https://modelcontextprotocol.io).

---

## Environment Variables

Sensitive values (API keys, tokens) should never be hardcoded in `.mcp.json`. Use `${VAR_NAME}` placeholders — Claude Code will expand them from the environment at startup.

Set them in your shell profile:
```bash
export GITHUB_TOKEN="ghp_..."
export BRAVE_API_KEY="BSA..."
```

Or pass inline when launching:
```bash
GITHUB_TOKEN=ghp_... claude
```

The `env` block inside each server entry is scoped to that server's process only — other servers don't inherit it.

---

## When to Use MCP vs Skills

| | MCP Servers | Skills |
|---|---|---|
| **What they provide** | Tools Claude can call (file access, API calls, search) | Instructions, workflows, prompts |
| **Runtime effect** | Claude gains new callable tools | Claude knows how to behave |
| **Example** | `github` server → Claude can list issues | `pr-review` skill → Claude knows how to review a PR |
| **Persistence** | Active while server is running | Always in context |
| **When to use** | You need to connect a new data source or API | You want to change how Claude thinks or works |

**Rule of thumb:** MCP gives Claude hands. Skills give Claude a brain. Use both.
