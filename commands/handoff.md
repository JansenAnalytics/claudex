---
description: Write today's daily memory file + send a day-summary message to the user
allowed-tools: Bash, Read, Write, Edit
---

End-of-day handoff: persist what happened today to a daily memory file, then send a summary.

Steps:

1. **Determine today's date** (Europe/Oslo): `date +%Y-%m-%d`.
2. **Read existing daily file** at `~/.claude-agent/memory/YYYY-MM-DD.md` if present — you'll append/update, not overwrite.
3. **Gather what happened today:**
   - Completed tasks (`TaskList` filtered to status=completed today)
   - Decisions made (search today's transcript or recent memory)
   - Problems hit and how they were resolved
   - Anything the user asked for that's still in-flight (carry-over for tomorrow)
   - Notable file edits, PRs, deploys
4. **Write/update the daily file** with sections:
   ```markdown
   # YYYY-MM-DD

   ## Done
   - ...

   ## Decisions
   - ...

   ## Carry-over to tomorrow
   - ...

   ## Notes
   - anything else worth remembering
   ```
   If the file already exists, merge new entries — don't duplicate.

5. **Send a Telegram summary** to the user: 5–10 bullets covering "Done / In-flight / Next". Format Telegram-friendly (no tables). End with a one-line "Resume point" for tomorrow.

Rules:
- Don't pad. A quiet day gets a short summary. If literally nothing happened, say so.
- Don't claim "done" on tasks that aren't actually done. Distinguish "completed" from "punted."
- The daily file is for FUTURE-you to read at session start — write so it's useful cold.
