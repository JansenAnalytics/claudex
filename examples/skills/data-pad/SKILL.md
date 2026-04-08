---
name: data-pad
description: "Use when: Aksel provides a CSV, JSON, or NDJSON file and wants analysis, filtering, aggregation, or exploration. Also use when you have structured data from an API and want to query it."
---

# Data Pad Skill

Use when: Aksel provides a CSV, JSON, or NDJSON file and wants analysis, filtering, aggregation, or exploration. Also use when you have structured data from an API and want to query it.

## Load data

```
node /home/ajans/projects/data-pad/load.cjs --file <path> [--table name] [--db name] [--overwrite]
node /home/ajans/projects/data-pad/load.cjs --file data.csv --table customers --db analysis
```

## Supported formats: .csv, .json, .ndjson

## Also supports: --url https://... (fetches JSON from URL)

## Run a query

```
node /home/ajans/projects/data-pad/query.cjs "SQL here" [--db name]
node /home/ajans/projects/data-pad/query.cjs "SELECT country, SUM(revenue) FROM customers GROUP BY country ORDER BY 2 DESC LIMIT 10"
```

## Explore schema

```
node /home/ajans/projects/data-pad/describe.cjs [--db name]
```

## List all databases

```
node /home/ajans/projects/data-pad/list-dbs.cjs
```

## Export results

```
node /home/ajans/projects/data-pad/export.cjs "SELECT ..." --out results.csv [--db name]
```

## Output formats for query

- `--csv` machine-readable CSV
- `--json` JSON array
- (default: pretty ASCII table)

## Common SQL patterns

```sql
-- Top N by value
SELECT name, revenue FROM customers ORDER BY revenue DESC LIMIT 10

-- Aggregation
SELECT country, COUNT(*) as count, AVG(revenue) as avg_rev FROM customers GROUP BY country

-- Filter + count
SELECT COUNT(*) FROM orders WHERE status = 'failed' AND amount > 100

-- Join (if you have multiple tables)
SELECT c.name, SUM(o.amount) FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.id
```

## Databases are stored at

`~/projects/data-pad/databases/`
