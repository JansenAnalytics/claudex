---
name: memory-search
description: Semantic memory search across all agent memories and conversation history. Use BEFORE answering questions about prior work, decisions, dates, people, preferences, projects, or past conversations. Also use when asked "do you remember", "what did we discuss", "when did we", etc.
---

# Memory Search — Semantic RAG

You have a vector memory search system that indexes:
- Your own memory files (CLAUDE.md, memory/*.md)
- Your Telegram conversation transcripts
- Cross-agent memories from Kite, Poe, and Argus (OpenClaw agents)

## When to Search

**ALWAYS search before answering about:**
- Prior work, decisions, or conversations
- Dates, timelines, project history
- People, preferences, or context from past sessions
- Anything Aksel says "remember" or "we discussed"
- Cross-agent context ("what has Argus been working on?")

## How to Search

```bash
# Basic search
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "your query here"

# Filter by source (memory files only, sessions only, cross-agent only)
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "query" --source memory
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "query" --source session
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "query" --source cross-agent

# Filter by agent
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "query" --agent kite
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "query" --agent argus

# More results
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "query" --limit 15

# JSON output (for parsing)
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "query" --json
```

## Interpreting Results

Each result shows:
- **Source**: `memory` (your files), `session` (conversation transcripts), `cross-agent` (Kite/Poe/Argus)
- **Agent**: which agent's data (claudex, kite, poe, argus)
- **Score**: hybrid of vector similarity (0.7) + text match (0.3), with recency decay
- **Snippet**: first 500 chars of the matched chunk

Higher scores = more relevant. Results above 0.3 are usually meaningful.

## Reindexing

The index updates automatically via cron (every 30 min). To force a reindex:

```bash
# Incremental (only changed files — fast)
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --index --incremental

# Full reindex (re-embeds everything — slower, costs API calls)
node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --index
```

## Important

- Requires `OPENAI_API_KEY` in environment
- Database: `~/.claude-agent/data/memory.sqlite`
- Cross-agent search lets you see what Kite, Poe, and Argus know without asking them
