---
name: hypothesis-tester
description: Hypothesis Tester Skill
---

# Hypothesis Tester Skill

Use when: Aksel asks an analytical question with multiple valid answers, tradeoffs between options, or when you want to avoid confirmation bias in your analysis.

Trigger phrases: "which is better", "compare options", "what's the risk", "tradeoffs", "should we", "evaluate", "debate"

## Workflow

### 1. Create debate session

```bash
node /home/ajans/projects/hypothesis-tester/new-debate.cjs \
  --question "Full question here" \
  --positions "option-a,option-b,option-c" \
  [--context "Relevant context: metrics, constraints, goals"]
```

### 2. Spawn sub-agents (using sessions_spawn / subagents tool)

Read the output from step 1. For each position:

- Read the prompt file content: `cat /home/ajans/projects/hypothesis-tester/sessions/<id>/prompt-<position>.md`
- Use the subagent spawning mechanism with that content as the task
- Sub-agent will write its analysis to the output file automatically

```
subagents.spawn(
  task="[content of prompt file]",
  model="anthropic/claude-sonnet-4-6",
  label="debate-<session>-<position>"
)
```

> Note: Kite must do this step in-session (scripts cannot spawn sub-agents).

### 3. After all sub-agents complete, synthesize

```bash
node /home/ajans/projects/hypothesis-tester/synthesize.cjs --session <id> --send
```

## Commands

| Command                                                                                                       | Purpose                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `node /home/ajans/projects/hypothesis-tester/new-debate.cjs --question "..." --positions "a,b,c"`             | Start a new debate            |
| `node /home/ajans/projects/hypothesis-tester/list-debates.cjs`                                                | List all sessions             |
| `node /home/ajans/projects/hypothesis-tester/synthesize.cjs --session <id>`                                   | Synthesize results            |
| `node /home/ajans/projects/hypothesis-tester/synthesize.cjs --session <id> --send`                            | Synthesize + send to Telegram |
| `node /home/ajans/projects/hypothesis-tester/add-position.cjs --session <id> --position <slug> --file <path>` | Manually add a position       |

## Reports saved to

`~/workspace/reports/debate-<id>.md`

## Model recommendation

- **Balanced (sonnet):** Most debates, general tradeoff analysis
- **Powerful (opus):** High-stakes decisions, complex technical choices

## Position naming

Use kebab-case: `freemium`, `flat-subscription`, `build-in-house`, `use-existing-api`

## Tips

- **2 positions minimum**, 3–5 is ideal. More than 6 gets hard to synthesize.
- Include `--context` with real numbers/constraints — sub-agents use this to make specific arguments.
- The synthesizer works with **partial results** — if a sub-agent fails, synthesize what you have.
- Self-ratings in position files drive the TL;DR verdict. Sub-agents should include `## Self-Rating: X/10 — [reason]` at the end.
