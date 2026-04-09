---
name: morning-briefing
description: Generate a morning briefing with weather, market overview, system health, and upcoming tasks. Use for daily briefings.
---

# Morning Briefing Skill

Generate a concise daily briefing for Aksel covering:

## 1. Weather (Oslo)
```bash
curl -s "wttr.in/Oslo?format=%c+%t+%h+%w+%p"
```

## 2. Market Overview
```bash
# FX rates (from exchangerate.host or similar free API)
curl -s "https://open.er-api.com/v6/latest/USD" | python3 -c "
import json,sys
d=json.load(sys.stdin)['rates']
pairs = {'EUR': d.get('EUR'), 'GBP': d.get('GBP'), 'AUD': d.get('AUD'), 'NZD': d.get('NZD'), 'CAD': d.get('CAD'), 'CHF': d.get('CHF'), 'JPY': d.get('JPY'), 'NOK': d.get('NOK')}
for k,v in pairs.items():
    if v: print(f'USD/{k}: {v:.4f}')
" 2>/dev/null || echo "FX data unavailable"
```

## 3. System Health
```bash
# Disk usage
df -h / | tail -1 | awk '{print "Disk: " $5 " used"}'

# Services
for svc in openclaw-poe-gateway openclaw-argus-gateway; do
    status=$(systemctl --user is-active $svc 2>/dev/null || echo "unknown")
    echo "$svc: $status"
done

# Claudex uptime
pid=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null | head -1)
if [ -n "$pid" ]; then
    echo "Claudex: running ($(ps -p $pid -o etime= | xargs))"
fi
```

## 4. GitHub Activity
```bash
# Recent notifications
~/.local/bin/gh api notifications --jq '.[0:5] | .[] | "[\(.repository.name)] \(.subject.title)"' 2>/dev/null || echo "No notifications"
```

## 5. Trade System Status
```bash
# Last trade from journal
sqlite3 ~/projects/prop-hedge-agents/data/trade-journal.db \
    "SELECT date, strategy_type, outcome FROM trades ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "No trades"
```

## Output Format (for Telegram)
Keep it brief — bullet points, no tables:
```
☀️ Oslo: 12°C, partly cloudy, light wind

📊 Markets:
• EUR/USD: 1.0842
• GBP/USD: 1.2650
• ...

🖥️ Systems: All healthy
• Kite ✅ | Poe ✅ | Argus ✅ | Claudex ✅

📌 Today:
• [any calendar events or reminders]
```
