---
description: Capture a fact to today's daily note (and durable auto-memory if it's lasting)
allowed-tools: Bash, Read, Write, Edit
argument-hint: <text>
---

Frictionless memory capture. The fact to remember is: $ARGUMENTS

Capture exactly one fact, fast. No interrogation, no fluff.

1. **Resolve date & time** (Europe/Oslo):
   `date=$(TZ=Europe/Oslo date +%Y-%m-%d)` and `time=$(TZ=Europe/Oslo date +%H:%M)`.

2. **Append to today's daily note** at `~/.claude-agent/memory/$date.md`:
   - If the file doesn't exist, create it with a `# $date` header.
   - If there's no `## Quick notes` section, add one.
   - Append a bullet under it: `- HH:MM — <the fact>`.
   - NEVER overwrite or rewrite existing content — append only. Read first, then Edit/Write.

3. **Judge durability.** Is this a LASTING user preference, feedback, project fact, or reference — something future-you should know weeks from now? Or just today's ephemera (a transient status, a one-off reminder)?
   - **Ephemeral** → daily note is enough. Skip to step 4.
   - **Lasting** → ALSO persist to cross-session auto-memory:
     - Dir: `$HOME/.claude/projects/$(echo "$HOME/.claude-agent" | sed 's#[/.]#-#g')/memory/` (Claude Code derives the project dir by replacing `/` and `.` with `-`)
     - First check that dir's `MEMORY.md` and existing files for one covering the same fact. If found, UPDATE it (don't duplicate).
     - Otherwise write `<slug>.md` (short, hyphenated, type-prefixed e.g. `user-`/`feedback-`/`project-`/`reference-`) with frontmatter:
       ```
       ---
       name: <slug>
       description: "<one-line summary>"
       metadata:
         node_type: memory
         type: user|feedback|project|reference
       ---
       ```
       followed by the fact + brief context (the why, dated).
     - Add a one-line pointer to `MEMORY.md`: `- [Title](<slug>.md) — <one-line>`.

4. **Confirm to the user via Telegram** (reply tool): exactly what was saved and where.
   - Daily only: `✅ Noted in today's daily note: <fact>`
   - Durable too: `✅ Saved + persisted to durable memory (<type>): <fact>`
   Keep it to one line. Don't restate the whole thing back twice.
