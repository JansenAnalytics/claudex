---
name: meta-analyst
description: Self-reflection and auto-improvement skill — analyzes session logs, tracks patterns, produces efficiency reports
triggers:
  - analyze sessions
  - efficiency report
  - track event
  - meta analysis
  - self-improvement report
---

# Meta-Analyst

Self-reflection skill that analyzes your session logs, tracks events, and produces efficiency reports. Helps identify what fails often, what takes too long, and what patterns repeat.

## Commands

### Track an event
```bash
node ~/openclaw/skills/meta-analyst/scripts/track.cjs <type> "message" [--category CAT] [--duration DUR] [--source SRC]
```
Types: `error`, `success`, `retry`, `improvement`, `lesson`

Examples:
```bash
node ~/openclaw/skills/meta-analyst/scripts/track.cjs error "cloudscraper failed" --category scraping
node ~/openclaw/skills/meta-analyst/scripts/track.cjs success "built kanban skill" --duration 45m --category skill-building
node ~/openclaw/skills/meta-analyst/scripts/track.cjs retry "web_search failed, used searxng" --category search
node ~/openclaw/skills/meta-analyst/scripts/track.cjs lesson "always verify sub-agent output" --category workflow
```

### Generate a report
```bash
node ~/openclaw/skills/meta-analyst/scripts/report.cjs [--period week|month|all] [--format markdown|json] [--out-file PATH]
```

### Raw analysis (JSON)
```bash
node ~/openclaw/skills/meta-analyst/scripts/analyze.cjs [--period week|month|all]
```

## Data Sources
- `~/.openclaw-poe/workspace/memory/*.md` — daily log files (parsed for tool usage, errors, projects, lessons)
- `~/.meta-analyst/events.db` — SQLite database of tracked events

## Report Sections
- Tool usage frequency
- Error/failure patterns
- Common shell commands
- Project focus distribution
- Sub-agent & retry reliability stats
- Tracked events summary
- Lessons learned
- Auto-generated improvement suggestions

## Agent Workflow

### During heartbeats (periodic)
- Run `report.cjs --period week` every few days to check trends
- Track notable events as they happen (errors, retries, successes)
- Review suggestions and act on recurring issues

### After task completion
- Track success/failure: `track.cjs success "task description" --duration Xm`
- If something failed/retried: `track.cjs retry "what happened" --category X`

### Weekly review
- Generate full report: `report.cjs --period week --out-file /tmp/weekly-report.md`
- Update MEMORY.md with key insights
- Address top suggestions

## Technical Details
- DB: `~/.meta-analyst/events.db` (SQLite via better-sqlite3)
- Node modules symlinked from kanban-agent
- All scripts are `.cjs` (CommonJS)
