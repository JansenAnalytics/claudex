---
name: data-validator
user-invocable: false
description: Autonomous data quality validation — schema inference and validation, completeness/uniqueness/consistency checks, statistical anomaly detection, time-series gap detection, referential integrity, dataset comparison and drift detection. Supports CSV, JSON, SQLite, APIs. Use after any data pipeline work.
triggers:
  - validate data
  - data quality
  - check data
  - data validator
  - schema validation
---

# data-validator

Autonomous data quality validation for any data source — databases, CSVs, APIs, JSON files.

## Quick Start

```bash
data-validator /path/to/data.csv --infer          # Auto-detect schema & validate
data-validator /path/to/data.csv --schema s.json   # Validate against schema
data-validator /path/to/data.csv --full            # All checks including timeseries
```

## Binary: `~/bin/data-validator`

```
data-validator [command] <source> [options]
```

### Commands
| Command | Description |
|---------|-------------|
| `review` (default) | Full orchestrated validation |
| `schema` | Schema validation / inference |
| `quality` | Data quality scoring |
| `compare` | Diff two datasets |
| `integrity` | Referential integrity checks |
| `timeseries` | Time-series specific analysis |
| `report` | Generate report from results JSON |

### Sources
- `file.csv` — CSV with headers
- `file.json` — JSON array of objects
- `file.jsonl` / `file.ndjson` — Newline-delimited JSON
- `sqlite:/path/to/db.sqlite:tablename` — SQLite table
- `http://api/endpoint` — JSON API

### Options
| Option | Description |
|--------|-------------|
| `--schema FILE` | Schema JSON to validate against |
| `--infer` | Auto-infer schema from data |
| `--compare FILE2` | Compare with second dataset |
| `--timeseries` | Run time-series analysis |
| `--time-field NAME` | Specify time field |
| `--primary-key NAME` | Primary key field (default: id) |
| `--quick` | Schema + quality only |
| `--full` | All checks |
| `--output-dir DIR` | Write individual reports to directory |
| `--format md\|json` | Output format |
| `--output FILE` | Output file (per-script) |

## Schema Format

```json
{
  "fields": {
    "id": { "type": "integer", "required": true, "unique": true, "min": 1 },
    "email": { "type": "string", "required": true, "pattern": "^[^@]+@[^@]+$" },
    "amount": { "type": "number", "min": 0, "max": 1000000 },
    "status": { "type": "enum", "values": ["active", "inactive", "pending"] },
    "created_at": { "type": "date", "format": "ISO8601", "after": "2020-01-01" },
    "tags": { "type": "array", "minLength": 1, "itemType": "string" }
  }
}
```

## Quality Dimensions

The quality score (0-100) is computed from:
- **Completeness** — % populated fields, flags >5% nulls
- **Validity** — Schema conformance per field
- **Consistency** — Format consistency, encoding
- **Accuracy** — Outlier detection (>3σ from mean)
- **Timeliness** — Gap detection in time-series data
- **Integrity** — Referential integrity, FK violations

## Scripts

| Script | Purpose |
|--------|---------|
| `schema.cjs` | Schema inference & validation |
| `quality.cjs` | Quality scoring (completeness, uniqueness, accuracy, distribution) |
| `compare.cjs` | Dataset diff & drift detection |
| `integrity.cjs` | FK violations, orphans (SQLite + file relationships) |
| `timeseries.cjs` | Gaps, duplicates, monotonicity, anomalies, staleness |
| `review.cjs` | Orchestrator — runs all checks |
| `report.cjs` | Report generator (MD + JSON) |

## Dependencies

- Node.js (built-in modules only, except better-sqlite3 for SQLite)
- `node_modules` symlinked from `~/openclaw/skills/kanban-agent/node_modules`
