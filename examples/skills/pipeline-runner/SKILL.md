---
description: "Execute multi-step pipelines defined in JSON with:"
name: pipeline-runner
triggers:
  - run pipeline
  - create pipeline
  - workflow
  - multi-step
  - backtest and deploy
  - if this then that
---

# Pipeline Runner Skill

## Overview

Execute multi-step pipelines defined in JSON with:
- Sequential and parallel stages
- Dependency chains (`needs`)
- Conditional execution (`if`)
- Retries with backoff
- Timeouts per step
- Variable passing between steps (stdout → env var)
- Failure handling (`on_fail: continue|notify`)
- Run history and logs

## Script

```bash
node ~/openclaw/skills/pipeline-runner/scripts/pipeline.cjs <command> [args]
```

## Commands

```bash
pipeline run <file.json> [--dry-run] [--var key=value]   — Execute a pipeline
pipeline validate <file.json>                             — Validate syntax
pipeline list                                             — List saved pipelines
pipeline history [--limit 10]                             — Recent runs
pipeline show-run <run-id>                                — Run details
```

## Pipeline Format (JSON)

```json
{
  "name": "my-pipeline",
  "env": { "MY_VAR": "value" },
  "steps": [
    {
      "name": "build",
      "run": "npm run build",
      "timeout": 120,
      "retries": 2,
      "retry_delay": 5
    },
    {
      "name": "test",
      "needs": ["build"],
      "run": "npm test",
      "on_fail": "continue"
    },
    {
      "name": "deploy",
      "needs": ["test"],
      "if": "steps.test.exitCode == 0",
      "run": "./deploy.sh"
    },
    {
      "name": "checks",
      "parallel": [
        { "name": "lint", "run": "npm run lint" },
        { "name": "typecheck", "run": "tsc --noEmit" }
      ]
    }
  ]
}
```

## Step Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | required | Unique step identifier |
| `run` | string | — | Shell command to execute |
| `needs` | string[] | — | Steps that must complete first |
| `if` | string | — | Condition: `steps.NAME.exitCode == 0` |
| `timeout` | number | 300 | Seconds before kill |
| `retries` | number | 0 | Retry count on failure |
| `retry_delay` | number | 5 | Seconds between retries |
| `on_fail` | string | halt | `continue` or `notify` or halt |
| `parallel` | step[] | — | Run sub-steps in parallel |

## Variable Passing

Each step's stdout is available to subsequent steps as:
`$STEP_<NAME>_OUTPUT` (name uppercased, non-alphanumeric → underscore)

## Agent Workflow

### Creating pipelines on the fly
When Aksel asks for a multi-step workflow, write a JSON pipeline file and run it:

```bash
# Write pipeline
cat > /tmp/my-pipeline.json << 'EOF'
{ "name": "...", "steps": [...] }
EOF

# Execute
node pipeline.cjs run /tmp/my-pipeline.json
```

### Saving reusable pipelines
Store in `~/.pipelines/` for future use:
```bash
cp /tmp/my-pipeline.json ~/.pipelines/backtest-flow.json
```

### Dry runs
Always dry-run complex pipelines first:
```bash
node pipeline.cjs run pipeline.json --dry-run
```

## Examples

See `~/openclaw/skills/pipeline-runner/examples/`:
- `test-pipeline.json` — basic test with all features
- `backtest-pipeline.json` — prop-hedge backtest → analyze → commit → push

## Storage

- **Pipeline files:** `~/.pipelines/` (JSON)
- **Run logs:** `~/.pipelines/runs/` (JSON, one per run)
