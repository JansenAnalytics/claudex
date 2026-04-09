---
name: prompt-library
description: "Library of tested prompt patterns for sub-agent orchestration: task decomposition, verification, error recovery, chain-of-thought."
---

# prompt-library

Library of tested prompt patterns for sub-agent orchestration: task decomposition, verification, error recovery, chain-of-thought.

## Use When

- Designing prompts for sub-agents
- Improving task delegation quality
- Building multi-agent workflows
- Debugging sub-agent failures
- Need a proven pattern instead of ad-hoc prompting

## Scripts

### render-template.sh

Renders a prompt template by filling `{{VARIABLE}}` placeholders from CLI args or env vars.

```bash
bash scripts/render-template.sh <template-file> VAR1="value1" VAR2="value2"
```

### task-splitter.sh

Splits a complex task description into sub-agent-ready subtasks with dependency ordering.

```bash
bash scripts/task-splitter.sh "Build a full-stack app with auth, DB, and frontend"
# Outputs numbered subtasks with dependencies noted
```

## References

- `references/prompt-patterns.md` — Catalog of proven patterns (task decomposition, verification, chain-of-thought, error recovery, few-shot, role-assignment)
- `references/anti-patterns.md` — Common mistakes and how to fix them
- `references/orchestration-patterns.md` — Multi-agent workflow patterns (fan-out, pipeline, supervisor)

## Examples

Render a task decomposition prompt:

```bash
bash scripts/render-template.sh references/templates/decompose.tmpl \
  TASK="Build a REST API" CONSTRAINTS="Use Python, under 200 lines"
```

Split a task for parallel sub-agents:

```bash
bash scripts/task-splitter.sh "Create three microservices: auth, billing, notifications"
```
