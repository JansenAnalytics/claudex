---
description: "SQLite-backed entity-relationship store. Entities (people, projects, decisions, tools, rules) connected by typed relations (decided-by, depends-on, supersedes, etc.). Full-text search, path finding..."
name: knowledge-graph
triggers:
  - what did we decide
  - knowledge graph
  - how is X related to Y
  - show me all decisions
  - project dependencies
  - who decided
  - design decision
  - link this to
  - what superseded
---

# Knowledge Graph Skill

## Overview

SQLite-backed entity-relationship store. Entities (people, projects, decisions, tools, rules) connected by typed relations (decided-by, depends-on, supersedes, etc.). Full-text search, path finding, timeline, and auto-ingestion from markdown files.

**Why this over flat files**: "What sizing rules did Aksel decide for prop-hedge?" → one query returns the decision, who made it, when, what it superseded, and what it relates to. With flat files, that's 5 greps across MEMORY.md and daily logs.

## Script

```bash
KG=~/openclaw/skills/knowledge-graph/scripts/kg.cjs
node $KG <command> [args]
```

## Entity Types

| Type | Emoji | Use For |
|------|-------|---------|
| `person` | 👤 | People (Aksel, Poe, Kite) |
| `project` | 📁 | Projects (prop-hedge-agents, BrewBoard) |
| `decision` | ⚖️ | Design decisions, choices made |
| `tool` | 🔧 | Tools, services, libraries |
| `account` | 💰 | API accounts, trading accounts, credentials |
| `concept` | 💡 | Ideas, concepts, mental models |
| `rule` | 📏 | Rules, constraints, invariants |
| `event` | 📅 | Events, meetings, incidents |
| `skill` | 🎯 | OpenClaw skills |
| `file` | 📄 | Important files, configs |
| `service` | ⚙️ | Running services, Docker containers |

## Relation Types

| Relation | Meaning | Auto-behavior |
|----------|---------|---------------|
| `decided-by` | Who made this decision | — |
| `depends-on` | X requires Y | — |
| `related-to` | Loosely connected | — |
| `supersedes` | X replaces Y | Auto-marks Y as `superseded` 🔴 |
| `belongs-to` | X is part of project Y | — |
| `created-by` | Who/what created this | — |
| `blocked-by` | X is blocked by Y | — |
| `implements` | Tool X implements decision Y | — |
| `uses` | X uses tool/library Y | — |
| `contradicts` | X conflicts with Y | — |
| `derived-from` | X was derived from Y | — |
| `part-of` | X is a component of Y | — |
| `triggers` | X triggers Y | — |
| `configures` | X configures Y | — |
| `owns` | X owns/manages Y | — |

## Commands

### Adding Knowledge

```bash
# Add entities
node $KG add decision "Funded account always 0.5x base" \
  --desc "Funded ALWAYS trades at 0.5x in P2vF" \
  --tags "sizing,fundamental" \
  --date 2026-03-02 \
  --source "DESIGN.md:§4"

node $KG add project "prop-hedge-agents" --desc "Multi-account hedge strategy" --tags "trading"
node $KG add person "Aksel" --desc "Product owner" --tags "human"

# Link entities
node $KG link "Funded account always 0.5x base" decided-by Aksel --note "Fundamental rule"
node $KG link "Funded account always 0.5x base" belongs-to prop-hedge-agents

# Supersede (auto-marks old as superseded)
node $KG add decision "SL_FRACTION 0.25%" --desc "Tighter stops" --date 2026-03-05
node $KG link "SL_FRACTION 0.25%" supersedes "SL_FRACTION 0.50%"
# → SL_FRACTION 0.50% automatically marked 🔴 superseded
```

### Querying

```bash
# Full-text search (uses FTS5 — fast and fuzzy)
node $KG search "funded account sizing" --related
node $KG search "sizing" --type decision --limit 10

# Show entity with all relations + history
node $KG show "prop-hedge-agents" --depth 2

# Find all related entities
node $KG related Aksel --depth 2 --type decision

# Find path between two entities (BFS shortest path)
node $KG path SearXNG "Funded account always 0.5x base"

# Timeline of dated entities
node $KG timeline --type decision --project prop-hedge-agents

# List by type/tag/date
node $KG list --type decision --tag sizing
node $KG list --since 2026-03-01
```

### Maintenance

```bash
# Update entity
node $KG update "SL_FRACTION 0.25%" --status superseded --desc "Now using 0.20%"

# Merge duplicate entities (keeps all relations)
node $KG merge "prop-hedge" "prop-hedge-agents"

# Delete
node $KG delete 42

# Remove a relation
node $KG unlink "X" related-to "Y"
```

### Ingestion

```bash
# Auto-extract entities from markdown (MEMORY.md, daily logs)
node $KG ingest ~/path/to/MEMORY.md --dry-run    # Preview what would be extracted
node $KG ingest ~/path/to/MEMORY.md               # Actually ingest
```

Ingestion parses `## Headings` as entities, classifies type by keywords (decision/rule/tool/project), extracts dates from headings, and deduplicates against existing entities.

### Export

```bash
node $KG export --format json       # Full JSON dump
node $KG export --format dot        # GraphViz DOT (for visualization)
node $KG export --format markdown   # Human-readable
```

### Stats

```bash
node $KG stats   # Entity/relation counts, most connected nodes, recent updates
```

## Agent Workflow

### When to add knowledge

**Immediately** when:
- Aksel makes a design decision → `add decision` + `link decided-by Aksel` + `link belongs-to <project>`
- A new rule/constraint is established → `add rule`
- Something supersedes an old decision → `link X supersedes Y`
- A new tool/service is set up → `add tool` + `link implements <decision>`

### During heartbeats

Periodically (every few days):
1. Run `kg ingest` on recent daily log files to catch entities missed during sessions
2. Run `kg stats` to check graph health
3. Look for orphan entities (no relations) and connect them

### When asked "what did we decide about X?"

```bash
node $KG search "X" --type decision --related
```

This returns the decision, who made it, what project it belongs to, what it superseded, and related decisions.

### When starting work on a project

```bash
node $KG show "<project>" --depth 2
```

Shows all decisions, rules, tools, and people connected to the project.

## Database

- **Location:** `~/.knowledge-graph/kg.db` (SQLite, WAL mode, FTS5)
- **Tables:** entities, relations, entity_log, entities_fts (full-text search)
- **Env override:** `KG_DB=/path/to/kg.db`
- **Indexes:** type, name, tags, status, relation type, from/to IDs
