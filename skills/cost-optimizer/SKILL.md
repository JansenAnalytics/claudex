---
name: cost-optimizer
description: "Track and optimize LLM token spend: estimate costs per task, recommend model tiers, monitor cumulative usage, suggest batching strategies."
---

# cost-optimizer

Track and optimize LLM token spend: estimate costs per task, recommend model tiers, monitor cumulative usage, suggest batching strategies.

## Use When

- Analyzing API costs for a project or session
- Choosing between model tiers (opus vs sonnet vs haiku)
- Estimating token budgets for upcoming work
- Reducing unnecessary token usage
- Reviewing cumulative spend

## Scripts

### token-counter.py

Count tokens in text input (stdin or file). Uses tiktoken-compatible estimation.

```bash
echo "Hello world" | python3 scripts/token-counter.py
python3 scripts/token-counter.py < myfile.txt
python3 scripts/token-counter.py --file myfile.txt
```

### cost-estimator.py

Map token counts to USD costs for various models.

```bash
python3 scripts/cost-estimator.py --input 1000 --output 500 --model claude-opus-4
python3 scripts/cost-estimator.py --input 1000 --output 500  # shows all models
```

### usage-analyzer.sh

Analyze OpenClaw usage logs to find spending patterns.

```bash
bash scripts/usage-analyzer.sh [--days 7] [--log-dir ~/.openclaw/logs]
```

## References

- `references/model-pricing.md` — Current pricing for major LLM providers
- `references/token-heuristics.md` — Rules of thumb for estimating tokens
- `references/cost-reduction.md` — Strategies to reduce token spend
