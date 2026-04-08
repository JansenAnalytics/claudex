---
name: prop-hedge
description: Prop trading hedge system — conferences, trade journal, stats, lessons. Use when Aksel sends trade commands or asks about trading.
---

# Prop-Hedge Trading System

## Bridge Script
```bash
# Detect if message is trade-related
node ~/projects/prop-hedge-agents/scripts/telegram-bridge.cjs --detect "message text"

# Process a command
node ~/projects/prop-hedge-agents/scripts/telegram-bridge.cjs --msg "/command" 2>/dev/null
```

## Commands
- `/conference P2VF BF:funded:104200 FP:phase2:96500` — Run conference
- `/close EUR:+0.5% GBP:-0.1% CHF:+0.4%` — Close trade + learning analysis
- `/stats [7d|30d|all]` — Performance stats
- `/journal [N]` — Last N trades
- `/lessons [agent] [pair] [regime]` — Query structured lessons
- `/review [7|14|30]` — Performance review
- `/status` — Current state

## Natural Language Detection
Also detects: "Ready to trade. P2VF..." / "Closing trades. EUR +0.5%..."

## Notes
- Conference takes ~120-210s with LLM mode (claude-sonnet)
- ANTHROPIC_API_KEY must be set in environment
- State persists in `~/projects/prop-hedge-agents/data/.last-trade-state.json`
- Trade journal DB: `~/projects/prop-hedge-agents/data/trade-journal.db`
