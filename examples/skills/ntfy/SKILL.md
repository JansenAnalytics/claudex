---
name: ntfy
description: Send push notifications to phones/desktops via ntfy. Use when the user wants to send alerts, reminders, or notifications.
---

# ntfy Push Notifications

Send notifications to Aksel's phone/desktop:

```bash
# Simple notification
curl -d "MESSAGE" ntfy.sh/TOPIC

# With title and priority
curl -H "Title: TITLE" -H "Priority: high" -d "MESSAGE" ntfy.sh/TOPIC

# With tags/emoji
curl -H "Tags: warning,skull" -d "MESSAGE" ntfy.sh/TOPIC

# With click URL
curl -H "Click: https://example.com" -d "MESSAGE" ntfy.sh/TOPIC
```

## Priority Levels
- `min` / `low` / `default` / `high` / `urgent`
- `urgent` bypasses DND on phone

## Tags (emoji shortcodes)
Common: `warning`, `white_check_mark`, `rotating_light`, `chart_with_upwards_trend`, `robot`

## Notes
- Free tier: 250 messages/day per IP
- No API key needed for ntfy.sh
- Topic = channel name (create any name, it's public unless self-hosted)
- Use a unique/random topic name for privacy
