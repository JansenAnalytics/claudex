---
name: budget
description: Estimate and rank what is consuming the context window — CLAUDE.md, MEMORY.md, USER.md, the 162 auto-loaded skill descriptions (ranked heaviest-first), and tool/MCP schemas. Use when asked about context bloat, token weight, "what's eating my context", which skills are heaviest, or with --cost for real spend.
category: meta
tags: [context-window, tokens, budget, bloat, skill-descriptions, cost]
maturity: beta
external_deps: []
---

# Budget

With ~162 skill descriptions auto-loaded every session, description sprawl is a plausible
silent tax on the context window — and until now we had **zero visibility** into it. This
skill estimates and ranks the static, auto-loaded pieces of context so bloat is visible and
prunable.

## Run it

```bash
python3 "$CLAUDE_SKILLS_DIR/budget/scripts/budget.py"            # ranked breakdown
python3 "$CLAUDE_SKILLS_DIR/budget/scripts/budget.py" --top 15   # show 15 heaviest skills
python3 "$CLAUDE_SKILLS_DIR/budget/scripts/budget.py" --json     # machine-readable
python3 "$CLAUDE_SKILLS_DIR/budget/scripts/budget.py" --cost     # + real spend (model-usage/codexbar)
```

If `$CLAUDE_SKILLS_DIR` is unset, it lives at `~/.claude-agent/.claude/skills/budget/`.

## What it measures

| Component | Source | Exactness |
|-----------|--------|-----------|
| CLAUDE.md + `.claude/rules/*.md` | file contents | exact size, est. tokens |
| MEMORY.md | auto-memory index | exact size, est. tokens |
| USER.md | curated profile | exact size, est. tokens |
| **Skill descriptions (×162)** | `skill-index.json` | **EXACT ranking** |
| system prompt | rough constant | **approximate — harness-hidden** |
| tool + MCP schemas | rough constant | **approximate — harness-hidden** |

## Reading the output

- **The skill-description ranking is the genuinely useful, exact part** — we own
  `skill-index.json`, so the heaviest-N list is real and directly actionable.
- **The grand total is an _estimate_.** The harness does not expose live context counts to
  the model, so the system-prompt and tool-schema rows are conservative constants. Treat the
  total as order-of-magnitude, not authoritative.
- **Tokenizer caveat:** uses `tiktoken o200k_base` (a GPT tokenizer) when available — close
  to Claude's tokenizer but not identical (±10-20% on absolute counts). Ranking is unaffected.
  Falls back to a `chars/4` heuristic if tiktoken isn't installed.

## What to do with it

- A heavy skill description → trim it, or feed it to the **skill-curator** (Tier 2 item 3) as
  a prune/consolidate candidate. Description weight is a property of the skill itself, so it's
  the right bloat lever (unlike time-unused, which only ever produces a report).
- `--cost` shells out to `model-usage` / `codexbar` for real per-model spend if installed.

## Rules

- Always present totals **as an estimate** — never imply the number is exact.
- Lead with the skill ranking (the exact part) when reporting to the user.
- Read-only. This skill never edits skills or settings — it only measures.
