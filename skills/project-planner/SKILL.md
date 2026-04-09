---
name: project-planner
description: Project Planner Skill
---

# Project Planner Skill

Use at the START of every significant project before any sub-agent is spawned or any code is written.
Also use when: Aksel asks for project status, before making a change that might affect other tasks, when a task fails.

## Workflow for a new project

### Step 1: Create the plan

```
node /home/ajans/projects/project-planner/plan.cjs new \
  --project <project-slug> \
  --description "What this project delivers"
```

### Step 2: Import all tasks at once (preferred for big projects)

```
# Write tasks.json with full task list, then:
node /home/ajans/projects/project-planner/plan.cjs import \
  --project <project-slug> \
  --file tasks.json
```

```
# Or add tasks one by one:
node /home/ajans/projects/project-planner/plan.cjs add \
  --project <project-slug> \
  --id task-01 \
  --name "Task name" \
  --requires "" \
  --produces "artifact-name" \
  --criteria "criterion 1,criterion 2,criterion 3" \
  --rollback "How to undo this if it fails" \
  --assigned sub-agent \
  --hours 3 \
  --priority high
```

### Step 3: Check what can start

```
node /home/ajans/projects/project-planner/plan.cjs next --project <slug>
node /home/ajans/projects/project-planner/plan.cjs parallel --project <slug>
```

### Step 4: Before starting a task

```
node /home/ajans/projects/project-planner/plan.cjs start --task task-01 --project <slug>
```

### Step 5: Before changing anything — check impact first

```
node /home/ajans/projects/project-planner/plan.cjs impact --task task-01 --project <slug>
```

### Step 6: After completing a task (verify criteria first!)

```
node /home/ajans/projects/project-planner/plan.cjs done --task task-01 --project <slug>
```

### Step 7: Status at any time

```
node /home/ajans/projects/project-planner/plan.cjs status --project <slug>
node /home/ajans/projects/project-planner/plan.cjs graph --project <slug>
```

### Step 8: Send report to Aksel

```
node /home/ajans/projects/project-planner/plan.cjs report --project <slug> --send
```

## Key rules

1. NEVER mark a task done without verifying acceptance criteria
2. ALWAYS run impact analysis before modifying a task that has dependents
3. Use parallel command to identify sub-agent opportunities
4. Record blockers immediately when found — don't just note it in chat

## All commands

```
plan.cjs new        --project --description
plan.cjs add        --project --id --name --requires --produces --criteria --rollback --assigned --hours --priority --tags
plan.cjs import     --project --file
plan.cjs status     [--project]
plan.cjs next       [--project]
plan.cjs impact     --task [--project]
plan.cjs start      --task [--project]
plan.cjs done       --task [--project] [--note] [--confirm]
plan.cjs fail       --task --reason [--project]
plan.cjs block      --task --reason [--project]
plan.cjs unblock    --task [--project]
plan.cjs retry      --task [--project]
plan.cjs note       --task <text> [--project]
plan.cjs update     --task [--project] [--assigned] [--hours] [--priority]
plan.cjs graph      [--project]
plan.cjs parallel   [--project]
plan.cjs report     [--project] [--send]
plan.cjs list
validate.cjs        --project
```

## PLAN files

```
~/projects/<project>/PLAN.json   — machine-readable (authoritative)
~/projects/<project>/PLAN.md     — human-readable (auto-generated, do not edit)
```

## Subtask Planning

Use subtasks for any task that:

- Is assigned to a sub-agent (gives it a precise execution plan)
- Has estimated_hours > 2 (likely has internal structure)
- Has 3+ acceptance criteria (each might deserve its own subtask)

### Add subtasks to a task

```
node /home/ajans/projects/project-planner/plan.cjs subtask import \
  --project <slug> --task <task-id> --file subtasks.json
```

### Subtask file format

```json
[{"id":"st-01","name":"...","requires":[],"criteria":["..."],"hours":1,"priority":"high"},...]
```

### Show subtask status

```
node /home/ajans/projects/project-planner/plan.cjs subtask list --task <id> --project <slug>
```

### Next runnable subtasks

```
node /home/ajans/projects/project-planner/plan.cjs subtask next --task <id> --project <slug>
```

### Parallel execution plan within a task

```
node /home/ajans/projects/project-planner/plan.cjs subtask parallel --task <id> --project <slug>
```

### Impact analysis for a subtask

```
node /home/ajans/projects/project-planner/plan.cjs subtask impact --task <id> --id <st-id> --project <slug>
```

### Subtask lifecycle

```
subtask start → subtask done → (auto-completes parent task when all done)
```

### Key rule: task.done is gated

A task cannot be marked done while any subtask is pending/running/failed.
Use --force to override (only when subtasks are genuinely irrelevant).

### All subtask commands

```
plan.cjs subtask add      --project --task --id --name --requires --produces --criteria --rollback --assigned --hours --priority
plan.cjs subtask import   --project --task --file
plan.cjs subtask list     --project --task
plan.cjs subtask next     --project --task
plan.cjs subtask parallel --project --task
plan.cjs subtask impact   --project --task --id
plan.cjs subtask graph    --project --task
plan.cjs subtask start    --project --task --id
plan.cjs subtask done     --project --task --id [--confirm] [--force]
plan.cjs subtask fail     --project --task --id --reason
plan.cjs subtask block    --project --task --id --reason
plan.cjs subtask unblock  --project --task --id
plan.cjs subtask retry    --project --task --id
plan.cjs subtask note     --project --task --id <text>
plan.cjs subtask update   --project --task --id [--assigned] [--hours] [--priority]
```
