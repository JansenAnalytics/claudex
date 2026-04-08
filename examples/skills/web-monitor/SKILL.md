---
name: web-monitor
description: Monitor websites for changes, stock availability, price drops. Use when asked to watch a URL or check for changes.
---

# Web Monitor

Check websites for changes and alert via Telegram or ntfy.

## Quick URL Check
```bash
# Check if page contains text
curl -s URL | grep -qi "SEARCH_TEXT" && echo "FOUND" || echo "NOT FOUND"

# Check HTTP status
curl -s -o /dev/null -w "%{http_code}" URL

# Get page title
curl -s URL | grep -oP '(?<=<title>).*?(?=</title>)'

# Check price (extract number near keyword)
curl -s URL | grep -oP '\d+[\.,]\d+' | head -5
```

## Persistent Monitoring
For repeated checks, create a cron-based monitor:

```bash
# Check every 5 minutes
*/5 * * * * curl -s URL | grep -qi "in stock" && curl -d "Item is in stock!" ntfy.sh/YOUR_TOPIC
```

## Check Types
1. **text-absent** — Alert when text disappears (e.g., "sold out" gone = in stock)
2. **text-present** — Alert when text appears
3. **http-status** — Alert on status change
4. **price-drop** — Alert when price below threshold
