---
description: "SKILL=~/openclaw/skills/opportunity-scanner/scripts"
name: opportunity-scanner
triggers:
  - scan opportunities
  - trade alert
  - what should I trade
  - opportunity
---

# Opportunity Scanner

## Quick Start

```bash
SKILL=~/openclaw/skills/opportunity-scanner/scripts

# Full scan with Telegram output
python3 $SKILL/scan.py --telegram

# Refresh data + scan
python3 $SKILL/scan.py --refresh --telegram

# High conviction only (score ≥ 4)
python3 $SKILL/scan.py --min-score 4 --telegram

# JSON for programmatic use
python3 $SKILL/scan.py --json
```

## Cron Setup

For daily scans before market sessions:
```bash
# Europe open (07:00 CET)
0 6 * * 1-5 cd ~/openclaw/skills/opportunity-scanner && python3 scripts/scan.py --refresh --telegram > /tmp/scan.txt 2>/dev/null

# US open (14:30 CET)  
30 13 * * 1-5 cd ~/openclaw/skills/opportunity-scanner && python3 scripts/scan.py --telegram > /tmp/scan.txt 2>/dev/null
```

## Depends On
All upstream research skills: market-data-engine, technical-analysis-engine,
fundamental-research-engine, economic-data-collector, sentiment-engine, research-synthesizer
