# Vector Memory Search (RAG System)

Claude Code's built-in auto-memory is basic — it learns key-value facts across sessions, but has no semantic search, no conversation history recall, and no cross-agent awareness. Claudex adds a full **vector RAG system** that gives the agent genuine memory: the ability to search through everything it's ever discussed, decided, or written.

---

## Overview

The memory search system (`scripts/memory-search.cjs`) builds a SQLite database with OpenAI embeddings over three data sources:

| Source | What Gets Indexed | Why It Matters |
|---|---|---|
| **Memory files** | `CLAUDE.md`, `memory/*.md` | Your agent's curated knowledge — decisions, preferences, project context |
| **Session transcripts** | `~/.claude/projects/<workspace>/*.jsonl` | Full Telegram/CLI conversation history — every message ever exchanged |
| **Cross-agent memories** | Other agents' `MEMORY.md` + `memory/*.md` | What your other agents know — enables collaborative recall |

Search is **hybrid**: 70% vector similarity (semantic meaning) + 30% full-text search (exact keywords) + recency decay (recent memories rank higher).

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│                  memory-search.cjs                  │
│                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │   Chunker    │  │   Embedder   │  │  Scorer  │ │
│  │              │  │              │  │          │ │
│  │ Markdown →   │  │ OpenAI API   │  │ Vector   │ │
│  │  sections    │  │ text-embed-  │  │ + FTS5   │ │
│  │ JSONL →      │  │ ding-3-small │  │ + recency│ │
│  │  messages    │  │              │  │ = hybrid │ │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │
│         │                 │               │        │
│         └────────┬────────┘               │        │
│                  ▼                        │        │
│         ┌──────────────┐                  │        │
│         │  SQLite DB   │◄─────────────────┘        │
│         │              │                           │
│         │ chunks table │  893+ chunks              │
│         │ FTS5 index   │  Embedding cache          │
│         │ file hashes  │  Incremental updates      │
│         └──────────────┘                           │
└────────────────────────────────────────────────────┘
         ▲                          │
         │ --index                  │ --search "query"
         │                          ▼
┌────────┴───────────────────────────────────────────┐
│                   Data Sources                      │
│                                                    │
│  ~/.claude-agent/          Claudex's own files     │
│    ├── CLAUDE.md                                   │
│    └── memory/*.md                                 │
│                                                    │
│  ~/.claude/projects/       Session transcripts     │
│    └── -workspace-path/                            │
│        └── *.jsonl                                 │
│                                                    │
│  ~/.openclaw/workspace/    Kite (OpenClaw agent)   │
│  ~/.openclaw-poe/workspace/  Poe (OpenClaw agent)  │
│  ~/.openclaw-argus/workspace/ Argus (OpenClaw)     │
└────────────────────────────────────────────────────┘
```

---

## Setup

### Prerequisites

- **Node.js 22+** (uses built-in `node:sqlite` — no npm dependencies)
- **OpenAI API key** (for `text-embedding-3-small` embeddings)

### Installation

If you ran `bootstrap.sh`, the memory search system is already installed. Otherwise:

```bash
# Copy scripts to your workspace
cp scripts/memory-search.cjs ~/.claude-agent/scripts/
cp scripts/memory-reindex.sh ~/.claude-agent/scripts/
chmod +x ~/.claude-agent/scripts/memory-reindex.sh

# Copy the skill
mkdir -p ~/.claude-agent/.claude/skills/memory-search
cp skills/memory-search/SKILL.md ~/.claude-agent/.claude/skills/memory-search/

# Create data directory
mkdir -p ~/.claude-agent/data
```

### Set Your API Key

The system needs `OPENAI_API_KEY` for generating embeddings. Set it one of these ways:

```bash
# Option 1: Environment variable (add to ~/.bashrc)
export OPENAI_API_KEY="sk-..."

# Option 2: Shared env file (recommended for multi-agent setups)
echo 'OPENAI_API_KEY=sk-...' > ~/.claude-agent/.env
chmod 600 ~/.claude-agent/.env

# Option 3: Pass inline
OPENAI_API_KEY=sk-... node --experimental-sqlite scripts/memory-search.cjs --index
```

### Initial Index

Build the index for the first time:

```bash
cd ~/.claude-agent
node --experimental-sqlite scripts/memory-search.cjs --index
```

This will:
1. Discover all memory files, session transcripts, and cross-agent memories
2. Chunk each file into semantically meaningful segments (100–1500 chars each)
3. Generate embeddings via OpenAI API (~$0.01 for 1000 chunks)
4. Store everything in `data/memory.sqlite`

Expected output:
```
🔍 Full indexing...
  ✓ [memory] CLAUDE.md → 12 chunks
  ✓ [memory] 2026-04-08.md → 5 chunks
  ✓ [session] 32a941a6-....jsonl → 10 chunks
  ✓ [kite] MEMORY.md → 34 chunks
  ✓ [kite] 2026-03-18.md → 5 chunks
  ...

✅ Done: 55 indexed, 0 skipped, 0 errors
   893 chunks, 893 embeddings, 55 files found
```

### Automatic Reindexing

Set up cron to keep the index fresh:

```bash
# Add to crontab (every 30 minutes)
(crontab -l 2>/dev/null; echo "*/30 * * * * bash ~/.claude-agent/scripts/memory-reindex.sh") | crontab -
```

And add a SessionStart hook so the index updates every time the agent starts a new session:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "OPENAI_API_KEY=... node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --index --incremental 2>/dev/null || true"
      }]
    }]
  }
}
```

---

## Usage

### Search

```bash
# Basic semantic search
node --experimental-sqlite scripts/memory-search.cjs --search "what was the decision about database schema"

# More results
node --experimental-sqlite scripts/memory-search.cjs --search "query" --limit 15

# JSON output (for programmatic use)
node --experimental-sqlite scripts/memory-search.cjs --search "query" --json

# Quiet mode (results only, no decorations)
node --experimental-sqlite scripts/memory-search.cjs --search "query" --quiet
```

### Filter by Source

```bash
# Only search memory files (CLAUDE.md, memory/*.md)
node --experimental-sqlite scripts/memory-search.cjs --search "query" --source memory

# Only search conversation transcripts
node --experimental-sqlite scripts/memory-search.cjs --search "query" --source session

# Only search other agents' memories
node --experimental-sqlite scripts/memory-search.cjs --search "query" --source cross-agent
```

### Filter by Agent

```bash
# What does Kite know about this?
node --experimental-sqlite scripts/memory-search.cjs --search "query" --agent kite

# What has Argus been working on?
node --experimental-sqlite scripts/memory-search.cjs --search "recent property analysis" --agent argus
```

### Indexing

```bash
# Full reindex (re-embeds everything)
node --experimental-sqlite scripts/memory-search.cjs --index

# Incremental reindex (skip unchanged files — fast, cheap)
node --experimental-sqlite scripts/memory-search.cjs --index --incremental
```

### Statistics

```bash
node --experimental-sqlite scripts/memory-search.cjs --stats
```

Output:
```
📊 Claudex Memory Search
   Chunks: 893 | Files: 55 | Cached embeddings: 409

   By source:
     cross-agent: 857 chunks (464.8 KB)
     memory: 26 chunks (8.2 KB)
     session: 10 chunks (9.7 KB)
   By agent:
     argus: 301 chunks
     claudex: 36 chunks
     kite: 289 chunks
     poe: 267 chunks
```

---

## Search Results Format

Each result includes:

```
1. [kite] 2026-03-12.md#L40-L47 (0.432)
   ## Poe (formerly Metis) — Fully Operational
   - Folder: `~/.openclaw-poe/`
   - Service: `openclaw-poe-gateway.service` (port 18791)
   ...
   ─ vec:0.539 fts:0.725 recency:0.727
```

| Field | Meaning |
|---|---|
| `[kite]` | Source agent (claudex, kite, poe, argus) |
| `2026-03-12.md#L40-L47` | File and line range |
| `(0.432)` | Hybrid score (higher = more relevant) |
| `vec:0.539` | Vector similarity score (semantic match) |
| `fts:0.725` | Full-text search score (keyword match) |
| `recency:0.727` | Recency multiplier (1.0 = today, decays over time) |

**Score interpretation:**
- `> 0.5` — Strong match, highly relevant
- `0.3 – 0.5` — Relevant, worth reading
- `0.1 – 0.3` — Tangentially related
- `< 0.1` — Probably noise

---

## Cross-Agent Memory

One of the most powerful features: your Claudex agent can search through memories of your other agents. This enables questions like:

- "What has Argus been analyzing?" → Finds Argus's property due diligence notes
- "What did Kite decide about the trading system?" → Finds Kite's design decisions
- "What was Poe working on last week?" → Finds Poe's recent activity

### How It Works

The `discoverFiles()` function scans these directories for markdown files:

```javascript
const CROSS_AGENT_DIRS = {
  'kite':  '~/.openclaw/workspace',
  'poe':   '~/.openclaw-poe/workspace',
  'argus': '~/.openclaw-argus/workspace',
};
```

### Adding Your Own Agents

Edit the `CROSS_AGENT_DIRS` object in `memory-search.cjs` to add more agents:

```javascript
const CROSS_AGENT_DIRS = {
  'my-coder':    '/home/user/.openclaw-coder/workspace',
  'my-analyst':  '/home/user/.openclaw-analyst/workspace',
};
```

Or for another Claudex instance:

```javascript
const CROSS_AGENT_DIRS = {
  'claudex-2': '/home/user/.claude-agent-2',
};
```

---

## How Chunking Works

### Markdown Files

Markdown files are split at header boundaries (`#`, `##`, `###`). Each chunk:
- Carries its parent H1/H2 header as context prefix
- Has a minimum size of 100 characters (tiny chunks are merged)
- Has a maximum size of ~1500 characters (large sections are split at paragraph breaks)
- Target size: ~800 characters

### Session Transcripts

Claude Code session files (JSONL) are parsed message-by-message:
- Only `user` and `assistant` messages are indexed
- Tool results, commands, and system noise are skipped
- Messages are grouped into chunks of 4–6 messages
- Very long messages (>2000 chars) are truncated
- Each chunk carries role labels and dates for context

---

## Embedding Cache

Every text chunk's embedding is cached in the `embedding_cache` table, keyed by the SHA-256 hash of the text. This means:

- **Incremental reindex** only calls the OpenAI API for new or changed text
- **Full reindex** still benefits from the cache for unchanged chunks
- Cache has no TTL — embeddings for the same text are deterministic

Check cache size:
```bash
node --experimental-sqlite scripts/memory-search.cjs --stats
# Shows "Cached embeddings: N"
```

---

## Cost

Embeddings are cheap. `text-embedding-3-small` costs $0.02 per 1M tokens.

| Operation | Approximate Cost |
|---|---|
| Initial index (1000 chunks) | ~$0.01 |
| Daily incremental reindex | ~$0.001 |
| Single search query | ~$0.00001 |
| Monthly total (active use) | ~$0.05 |

The embedding cache ensures you almost never pay for the same text twice.

---

## Configuration

All configuration is at the top of `memory-search.cjs`:

```javascript
// Paths
const WORKSPACE = process.env.CLAUDEX_WORKSPACE || '~/.claude-agent';
const DB_PATH = process.env.CLAUDEX_MEMORY_DB || '~/.claude-agent/data/memory.sqlite';

// Embedding
const EMBEDDING_MODEL = 'text-embedding-3-small';  // 1536 dimensions
const EMBEDDING_BATCH_SIZE = 20;                     // Max texts per API call
const EMBEDDING_DELAY_MS = 250;                      // Delay between batches

// Chunking
const CHUNK_MIN_CHARS = 100;
const CHUNK_MAX_CHARS = 1500;
const CHUNK_TARGET_CHARS = 800;

// Search scoring
const VECTOR_WEIGHT = 0.7;          // Semantic similarity weight
const FTS_WEIGHT = 0.3;             // Keyword match weight
const RECENCY_HALF_LIFE_DAYS = 60;  // Score halves every 60 days
const DEFAULT_LIMIT = 8;            // Default number of results
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | (required) | OpenAI API key for embeddings |
| `CLAUDEX_WORKSPACE` | `~/.claude-agent` | Agent workspace path |
| `CLAUDEX_MEMORY_DB` | `~/.claude-agent/data/memory.sqlite` | Database path |
| `CLAUDEX_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |

---

## Troubleshooting

### "OPENAI_API_KEY not set"

The API key must be in the environment when running the script. If using cron, the `memory-reindex.sh` script reads it from a file — make sure the file exists:

```bash
# Check
cat ~/.openclaw/env  # or wherever you stored it
```

### "database is not open"

The SQLite database might be locked by another process. Wait a moment and retry. WAL mode handles most concurrent access, but simultaneous writes can conflict.

### Search returns no results

1. Check that the index has data: `--stats`
2. If 0 chunks, run `--index` to build the index
3. Check that your files exist in the expected locations
4. Try a broader query

### Incremental reindex never finds changes

The script compares file content hashes. If files haven't changed, it correctly skips them. Check the `--stats` output to see when files were last indexed.

### High API costs

This should not happen — the system is designed to be extremely cheap (~$0.05/month). If you're seeing high costs:
1. Check the embedding cache: `--stats` should show cached embeddings
2. Avoid running `--index` (full) repeatedly — use `--index --incremental`
3. Check that the cron isn't running `--index` instead of `--index --incremental`

---

## Comparison with OpenClaw Memory

| Feature | OpenClaw (`memory_search`) | Claudex RAG |
|---|---|---|
| **Type** | Built-in tool | Script called via bash |
| **Invocation** | Automatic (tool call) | Skill teaches when to call |
| **Embeddings** | OpenAI / Gemini / local GGUF | OpenAI (configurable) |
| **Vector store** | SQLite + sqlite-vec | SQLite + JSON embeddings |
| **Text search** | FTS5 | FTS5 |
| **Hybrid scoring** | Yes (configurable weights) | Yes (70/30 vector/FTS + recency) |
| **Session indexing** | Experimental flag | Built-in |
| **Cross-agent** | Not built-in (we used symlinks) | Built-in (configured in script) |
| **Recency decay** | Configurable half-life | 60-day half-life |
| **Auto-reindex** | File watcher (debounced) | Cron + SessionStart hook |
| **Zero-dependency** | Requires gateway runtime | Uses `node:sqlite` (Node 22 built-in) |
| **Cost** | Same (~$0.05/mo) | Same (~$0.05/mo) |

The Claudex RAG system is functionally equivalent to OpenClaw's memory search. The main difference is invocation: OpenClaw's `memory_search` is a native tool the agent can call directly, while Claudex's is a bash command the agent calls via its skill instructions. In practice, this works identically — the skill tells the agent when and how to search.
