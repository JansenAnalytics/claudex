---
name: data-pipeline
description: "ETL and data transformation: CSV, JSON, Parquet, NDJSON processing with filtering, mapping, joining, aggregating."
---

# data-pipeline

ETL and data transformation: CSV, JSON, Parquet, NDJSON processing with filtering, mapping, joining, aggregating.

## When to Use

- Converting between data formats (CSV ↔ JSON, NDJSON, etc.)
- Cleaning or filtering datasets
- Merging/joining files on a common key
- Aggregating data (sum, avg, count, min, max by group)
- Detecting file formats automatically
- Building multi-step data processing pipelines

## Scripts

| Script             | Purpose                  | Usage                                                                 |
| ------------------ | ------------------------ | --------------------------------------------------------------------- |
| `csv-to-json.py`   | Convert CSV → JSON array | `python3 csv-to-json.py input.csv [output.json]`                      |
| `json-to-csv.py`   | Convert JSON array → CSV | `python3 json-to-csv.py input.json [output.csv]`                      |
| `data-merge.py`    | Join two files on a key  | `python3 data-merge.py left.csv right.csv --key id [--how inner]`     |
| `data-filter.py`   | Filter + aggregate data  | `python3 data-filter.py input.csv --filter "col=val" --agg "col:sum"` |
| `detect-format.py` | Auto-detect file format  | `python3 detect-format.py file.ext`                                   |

All scripts read from stdin if no file argument given. Output goes to stdout by default.

## References

- `references/jq-cheatsheet.md` — Common jq patterns for JSON processing
- `references/csvkit-patterns.md` — csvkit one-liners
- `references/large-file-handling.md` — Strategies for big datasets

## Examples

```bash
# Convert CSV to JSON
python3 scripts/csv-to-json.py sales.csv > sales.json

# Filter rows and aggregate
python3 scripts/data-filter.py sales.csv --filter "region=Europe" --agg "revenue:sum,count"

# Merge two CSVs on 'id' column
python3 scripts/data-merge.py users.csv orders.csv --key user_id --how left

# Detect format
python3 scripts/detect-format.py mystery_file.dat
```

## Dependencies

- Python 3 (standard library only — csv, json, argparse)
- No external packages required
