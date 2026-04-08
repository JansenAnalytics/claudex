---
name: model-router
description: Model Router Skill
---

# Model Router Skill

Use EVERY TIME you are about to spawn a sub-agent or do significant work. Classify the task first, then use the right model tier.

## Step 1: Classify

```
node /home/ajans/projects/model-router/classify.cjs "your task description here"
```

Or get JSON for scripting:

```
node /home/ajans/projects/model-router/classify.cjs --json "task description"
```

## Step 2: Spawn with the recommended model

```
sessions_spawn(task=..., model="<model from classifier>")
```

## Step 3: Log usage (optional but encouraged)

```
node /home/ajans/projects/model-router/log-usage.cjs --task "..." --tier fast --model "..."
```

## Tier guide

### fast — anthropic/claude-haiku-4-5

Use for: summarize, format, extract, classify, convert, translate, clean data, rename, sort, filter
Cost: ~1× baseline
When in doubt about simple tasks, start here.

### balanced — anthropic/claude-sonnet-4-6 (default)

Use for: explain, compare, draft, review, outline, moderate analysis, code with clear spec
Cost: ~15× baseline

### powerful — anthropic/claude-opus-4-5

Use for: deep analysis, architecture decisions, complex tradeoffs, research synthesis, debates, long-form strategy
Cost: ~75× baseline
Reserve for tasks where quality clearly matters more than speed/cost.

## Classification signals

Fast triggers: summarize, format, extract, classify, categorize, convert, translate, list, count, clean, parse, fix typos, rename, sort, filter, deduplicate, "quick", "simple", "brief", "just"

Powerful triggers: "analyze deeply", architecture, tradeoffs, debate, hypothesis, synthesize, "design system", "evaluate options", comprehensive, thorough, research, strategy, critique, multiple complex questions

## Usage stats

```
node /home/ajans/projects/model-router/usage-report.cjs
node /home/ajans/projects/model-router/usage-report.cjs --days 30
```
