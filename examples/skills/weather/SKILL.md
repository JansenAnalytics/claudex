---
name: weather
description: Get current weather and forecasts. Use when the user asks about weather, temperature, or forecasts for any location.
---

# Weather Skill

Fetch weather using wttr.in:

```bash
# Current weather (concise)
curl -s "wttr.in/LOCATION?format=%l:+%c+%t+%h+%w"

# 3-day forecast
curl -s "wttr.in/LOCATION?format=v2"

# JSON for parsing
curl -s "wttr.in/LOCATION?format=j1"
```

Default location: **Oslo** (Aksel's location)

Format the response naturally — don't dump raw output.
