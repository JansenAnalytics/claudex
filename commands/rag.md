---
description: Semantic memory/RAG search across memories, transcripts, and cross-agent context
allowed-tools: Bash, Read
argument-hint: <query>
---

Semantic search across Claudex's memory store, session transcripts, and cross-agent context. Requires `OPENAI_API_KEY` (used for embeddings).

1. Run `node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "$ARGUMENTS" --limit 10`. If it errors on a **missing OPENAI_API_KEY**, say so plainly — that's the fix, not a bug.
2. If zero results, retry once without any `--source`/`--agent` filters. Still nothing → suggest `node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --index --incremental` to refresh the index, then re-run.
3. Present the top hits, Telegram-friendly, one bullet each:
   - `[memory|session|cross-agent]` source tag + score (e.g. `0.82`)
   - 1-2 line snippet of the matched content
   - file/line ref in `code` (e.g. `memory/2026-05-12.md:14`)
4. End with: **"Drill into a hit?"** — offer to open any one and read it in full.

Filter options to mention if useful (don't run unprompted): `--source memory|session|cross-agent` to scope, `--agent kite|argus` for a specific sister agent's context.

Output: bullets only, no tables, no preamble. Lead with a one-line verdict (✅ N hits / ⚠️ weak matches / ❌ nothing).
