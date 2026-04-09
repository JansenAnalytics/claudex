---
name: schema-analyzer
description: "Analyze database schemas: generate ERD diagrams, detect normalization issues, suggest indexes, find missing foreign keys, audit schema quality."
---

# schema-analyzer

Analyze database schemas: generate ERD diagrams, detect normalization issues, suggest indexes, find missing foreign keys, audit schema quality.

## When to Use

- Understanding a database structure
- Generating entity-relationship diagrams
- Optimizing schema design
- Finding denormalization issues
- Auditing database quality

## Scripts

### schema-erd.py

Generate ERD (Mermaid diagram) from a database.

```bash
python3 scripts/schema-erd.py --db myapp.db --type sqlite --format mermaid
python3 scripts/schema-erd.py --db myapp.db --type sqlite --format text
python3 scripts/schema-erd.py --db myapp.db --type sqlite --format json
```

### schema-audit.py

Audit schema quality and find issues.

```bash
python3 scripts/schema-audit.py --db myapp.db --type sqlite
```

Reports: missing PKs, missing indexes on FKs, naming inconsistencies, missing timestamps, nullable issues.

### index-advisor.py

Suggest optimal indexes.

```bash
python3 scripts/index-advisor.py --db myapp.db --type sqlite
```

Reports: existing indexes, suggested new indexes, foreign key columns without indexes.

## References

- `normalization-guide.md` — 1NF through 3NF with examples
- `indexing-guide.md` — Index types, composite indexes, when indexes hurt
