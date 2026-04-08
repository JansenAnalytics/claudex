---
name: mcp-hub
description: MCP server integration hub — standardized tool access to databases, filesystems, memory, reasoning, and 100s of third-party services via Model Context Protocol. Use when querying databases, structured file ops, knowledge graph memory, step-by-step reasoning, or when the user asks about MCP servers.
triggers:
  - mcp server
  - query database
  - structured thinking
  - knowledge graph memory
  - mcp tool
  - add mcp server
---

# MCP Hub — Model Context Protocol Integration

Central hub for all MCP server integrations. MCP provides standardized tool access — databases, files, APIs, and services through a common protocol.

## Quick Reference

```bash
# List all configured servers
mcporter list

# List tools for a specific server
mcporter list <server> --schema

# Call a tool
mcporter call <server.tool> key=value

# Call with JSON args
mcporter call <server.tool> --args '{"key": "value"}'
```

## Configured Servers

### 1. `filesystem` — File Operations
Controlled file access to project directories, workspace, skills, and /tmp.

```bash
# List directory
mcporter call filesystem.list_directory path=/home/ajans/projects

# Read a file
mcporter call filesystem.read_file path=/home/ajans/projects/forex-factory-scraper/README.md

# Search files by name
mcporter call filesystem.search_files path=/home/ajans/projects pattern="*.py"

# Get file info
mcporter call filesystem.get_file_info path=/home/ajans/projects/forex-factory-scraper/scraper.py

# Write a file
mcporter call filesystem.write_file path=/tmp/test.txt content="hello world"

# Move/rename
mcporter call filesystem.move_file source=/tmp/old.txt destination=/tmp/new.txt
```

**Allowed directories:** `/home/ajans/projects`, `/home/ajans/.openclaw-poe/workspace`, `/home/ajans/openclaw/skills`, `/tmp`

**14 tools:** read_file, read_text_file, read_multiple_files, write_file, edit_file, create_directory, list_directory, directory_tree, move_file, search_files, get_file_info, list_allowed_directories, read_image_file, tree

### 2. `sqlite` — Database Queries
Query SQLite databases. Default: kanban tasks DB.

```bash
# List tables
mcporter call sqlite.list_tables

# Describe a table
mcporter call sqlite.describe_table table_name=tasks

# Read query (SELECT only)
mcporter call sqlite.read_query query="SELECT * FROM tasks WHERE status='in_progress'"

# Write query (INSERT/UPDATE/DELETE)
mcporter call sqlite.write_query query="INSERT INTO tasks (title, status) VALUES ('test', 'todo')"
```

**Default DB:** `~/.kanban/tasks.db`
**Switch DB:** Edit `~/.mcporter/mcporter.json` → change `--db-path` arg. Or use the switch script:

```bash
# Switch to meta-analyst DB
node ~/openclaw/skills/mcp-hub/scripts/switch-db.cjs ~/.meta-analyst/events.db

# Switch to knowledge graph DB  
node ~/openclaw/skills/mcp-hub/scripts/switch-db.cjs ~/.knowledge-graph/kg.db

# Switch back to kanban
node ~/openclaw/skills/mcp-hub/scripts/switch-db.cjs ~/.kanban/tasks.db
```

**6 tools:** read_query, write_query, create_table, list_tables, describe_table, append_insight

### 3. `memory` — Knowledge Graph Memory
Persistent entity-relationship store. Stores facts as entities with observations and relations.

```bash
# Create entities
mcporter call memory.create_entities entities='[{"name":"Aksel","entityType":"person","observations":["Uses Telegram","Timezone Europe/Oslo"]}]'

# Create relations
mcporter call memory.create_relations relations='[{"from":"Poe","to":"Aksel","relationType":"assists"}]'

# Search by query
mcporter call memory.search_nodes query="forex"

# Open specific nodes
mcporter call memory.open_nodes names='["Aksel","Poe"]'

# Read entire graph
mcporter call memory.read_graph

# Add observations to existing entity
mcporter call memory.add_observations observations='[{"entityName":"Aksel","contents":["Prefers CET times over UTC"]}]'

# Delete entities
mcporter call memory.delete_entities entityNames='["test"]'

# Delete observations  
mcporter call memory.delete_observations deletions='[{"entityName":"test","observations":["old fact"]}]'

# Delete relations
mcporter call memory.delete_relations relations='[{"from":"A","to":"B","relationType":"knows"}]'
```

**Storage:** `~/.mcporter/memory-kg.json`
**9 tools:** create_entities, create_relations, add_observations, delete_entities, delete_observations, delete_relations, read_graph, search_nodes, open_nodes

### 4. `sequential-thinking` — Structured Reasoning
Step-by-step problem decomposition for complex tasks.

```bash
mcporter call sequential-thinking.sequentialthinking \
  thought="First, let me identify the core problem..." \
  thoughtNumber=1 \
  totalThoughts=5 \
  nextThoughtNeeded=true
```

**1 tool:** sequentialthinking (with branching, revision support)

---

## Adding New MCP Servers

### Config location
`~/.mcporter/mcporter.json`

### Adding a stdio server
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": { "API_KEY": "..." },
      "description": "What this server does"
    }
  }
}
```

### Adding a remote HTTP/SSE server
```json
{
  "mcpServers": {
    "remote-server": {
      "url": "https://mcp.example.com/sse",
      "description": "Remote MCP server"
    }
  }
}
```

### Testing
```bash
# Verify server starts
mcporter list my-server --schema

# Call a tool
mcporter call my-server.some_tool arg=value
```

---

## What MCP Servers Can Be Used For

### Categories of available servers (100s exist):

**🗄️ Databases**
- SQLite, PostgreSQL, MySQL, MongoDB, Redis, Supabase, Neon, PlanetScale
- Use: Query any database, inspect schemas, run analytics

**📂 File Systems & Storage**
- Local filesystem, Google Drive, Dropbox, S3, MinIO
- Use: Manage files across local and cloud storage

**💬 Communication**
- Slack, Discord, Telegram, Email (IMAP/SMTP), Microsoft Teams
- Use: Send messages, read channels, search conversations

**🔄 Version Control**
- GitHub, GitLab, Bitbucket (issues, PRs, repos, CI)
- Use: Manage repos, create issues, review PRs programmatically

**📋 Project Management**
- Linear, Jira, Notion, Trello, Asana, Monday.com
- Use: Create/update tickets, track sprints, manage backlogs

**💰 Finance & Payments**
- Stripe, Plaid, crypto APIs, stock market data
- Use: Monitor payments, check balances, analyze transactions

**📊 Monitoring & Observability**
- Sentry, Datadog, Grafana, PagerDuty
- Use: Check errors, view dashboards, acknowledge alerts

**🔎 Search & Data**
- Brave Search, Google Search, Tavily, web scraping, Wikipedia
- Use: Search the web, extract content, research topics

**☁️ Cloud Platforms**
- AWS, GCP, Azure, Vercel, Cloudflare, Docker
- Use: Manage infrastructure, deploy services, check status

**🏠 Home Automation**
- Home Assistant, MQTT, IoT device control
- Use: Control smart home devices, read sensors

**🧠 AI & Knowledge**
- Memory/knowledge graphs, RAG systems, vector DBs
- Use: Persistent memory, semantic search, context management

**📧 Productivity**
- Google Calendar, Todoist, Obsidian, Notion
- Use: Schedule events, manage tasks, organize notes

### High-value servers to consider adding:
1. **GitHub MCP** — richer than `gh` CLI for bulk operations
2. **Postgres MCP** — if we add a Postgres DB for any project
3. **Brave Search MCP** — alternative to SearXNG
4. **Sentry MCP** — if we deploy production services
5. **Docker MCP** — manage containers programmatically
6. **Notion/Linear MCP** — if Aksel uses these for project management

---

## Architecture Notes

- **mcporter** is the CLI bridge — it spawns stdio MCP servers on demand
- Config: `~/.mcporter/mcporter.json` (system-wide) or `./config/mcporter.json` (project)
- Each `mcporter call` spawns the server, calls the tool, gets the result, and exits
- For long-running use: `mcporter daemon start` keeps servers warm
- MCP servers are just programs that speak the MCP protocol over stdin/stdout or HTTP/SSE
