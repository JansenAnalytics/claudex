---
description: Run the morning briefing — weather, market overview, system health, upcoming tasks
allowed-tools: Bash, Read
---

Run the morning-briefing skill explicitly and send the output as a single Telegram message.

Steps:
1. Invoke the `morning-briefing` skill — it covers weather (Oslo), market overview (FX rates, key indices), system health (disk, memory, services), and upcoming scheduled tasks.
2. Add a recent-memory line if there's a daily memory file from yesterday or today worth surfacing.
3. Format as a single concise Telegram message (no markdown tables — bullets only). Lead with the date.
4. Send it via the telegram reply tool.

Keep the whole briefing under 15 lines. Skip sections that have nothing useful to report (e.g. don't say "0 services failed" — just omit).
