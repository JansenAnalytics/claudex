---
name: sql-query
description: "Build and execute complex SQL queries for analytics: joins, window functions, CTEs, aggregations, pivots."
---

# sql-query

Build and execute complex SQL queries for analytics: joins, window functions, CTEs, aggregations, pivots.

## When to Use

- Writing analytical queries with window functions, CTEs, or complex joins
- Building reports from databases
- Optimizing slow queries
- Transforming data with SQL
- Benchmarking query performance

## Scripts

| Script               | Purpose                             | Usage                                                                        |
| -------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `format-query.sh`    | Format and validate SQL queries     | `bash scripts/format-query.sh [file.sql\|-]`                                 |
| `suggest-indexes.sh` | Analyze queries and suggest indexes | `bash scripts/suggest-indexes.sh <sqlite\|postgres> <db> <query>`            |
| `benchmark.sh`       | Benchmark query execution time      | `bash scripts/benchmark.sh <sqlite\|postgres> <db> <query\|file.sql> [runs]` |

## References

| File                      | Contents                                |
| ------------------------- | --------------------------------------- |
| `window-functions.md`     | Window function patterns and examples   |
| `cte-patterns.md`         | Common Table Expression patterns        |
| `optimization-guide.md`   | Query optimization techniques           |
| `analytical-templates.md` | Ready-to-use analytical query templates |

## Examples

### Format a query

```bash
echo "SELECT a,b FROM t WHERE x=1 GROUP BY a ORDER BY b" | bash scripts/format-query.sh -
```

### Benchmark a query

```bash
bash scripts/benchmark.sh sqlite mydb.sqlite3 "SELECT count(*) FROM orders" 10
```
