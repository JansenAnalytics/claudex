---
name: seed-data
description: "Generate realistic test and seed data for any database schema: users, products, orders, time series, financial data."
---

# seed-data

Generate realistic test and seed data for any database schema: users, products, orders, time series, financial data.

## When to Use

- Populating databases for testing
- Creating demo data
- Generating fixtures for development
- Seeding development environments
- Creating realistic datasets for UI development

## Scripts

### seed-gen.py

Universal seed data generator with zero dependencies.

```bash
python3 scripts/seed-gen.py --schema schema.json --format sql --output seed.sql
python3 scripts/seed-gen.py --schema schema.json --format json
python3 scripts/seed-gen.py --schema schema.json --format csv --output data.csv
```

**Schema format:**

```json
{
  "tables": [
    {
      "name": "users",
      "count": 100,
      "columns": [
        { "name": "id", "type": "serial" },
        { "name": "email", "type": "email" },
        { "name": "name", "type": "name" },
        { "name": "created_at", "type": "datetime", "range": ["2024-01-01", "2024-12-31"] }
      ]
    }
  ]
}
```

**Supported types:** serial, uuid, name, email, phone, address, company, text, integer, float, boolean, datetime, date, choice, foreign_key

### timeseries-gen.py

Generate realistic time series data.

```bash
python3 scripts/timeseries-gen.py --type stock --start 2024-01-01 --end 2024-12-31 --interval 1h
python3 scripts/timeseries-gen.py --type temperature --start 2024-01-01 --end 2024-12-31 --interval 1d
python3 scripts/timeseries-gen.py --type pageviews --interval 1h --output views.csv
```

**Types:** stock, temperature, pageviews, sensor

### schema-to-seed.sh

Generate seed schema JSON from existing database.

```bash
bash scripts/schema-to-seed.sh --db myapp.db --type sqlite --output schema.json
bash scripts/schema-to-seed.sh --db "postgresql://user:pass@host/db" --type postgres --output schema.json
```

## References

- `data-patterns.md` — Realistic data patterns and distributions
