---
name: data-analysis
description: Analyze data from CSV, JSON, SQLite, or APIs. Use when asked to analyze, summarize, or visualize data.
---

# Data Analysis

## SQLite
```bash
# Query a database
sqlite3 DB_PATH "SELECT * FROM table LIMIT 10;"

# Schema inspection
sqlite3 DB_PATH ".tables"
sqlite3 DB_PATH ".schema table_name"

# Export to CSV
sqlite3 -header -csv DB_PATH "SELECT * FROM table;" > output.csv
```

## Key Databases
- **Trade journal:** ~/projects/prop-hedge-agents/data/trade-journal.db
  - Tables: trades, lessons, market_contexts, agent_memory
  - 34+ trades with structured lessons

## JSON Processing
```bash
# Pretty print
cat file.json | python3 -m json.tool

# Extract with jq (if installed) or python
cat file.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['key'])"
```

## CSV Processing
```bash
# Quick stats with python
python3 -c "
import csv, statistics
with open('file.csv') as f:
    reader = csv.DictReader(f)
    data = list(reader)
print(f'Rows: {len(data)}')
print(f'Columns: {list(data[0].keys())}')
"
```

## Visualization (if matplotlib available)
```python
import matplotlib.pyplot as plt
# Create charts and save to file
plt.savefig('/tmp/chart.png', dpi=150, bbox_inches='tight')
```

Always summarize findings in plain language, not just raw numbers.
