---
name: whoami
description: Show the auto-curated user profile (memory/USER.md) — who the user is, preferences, working patterns, recent corrections, and open threads — with last-updated, section counts, and a token-cap/prune check. Use when asked "what do you know about me", "show my profile", "whoami", or to review/prune the profile.
category: meta
tags: [user-profile, memory, self-knowledge, review, curation]
maturity: beta
external_deps: []
---

# whoami

Renders the **auto-curated user profile** — the structured `memory/USER.md` that the
memory-curate Stop hook maintains and that `session-init.sh` loads into every session.

This is the read-only review surface for the profile (Tier 2 item 4C). It does not edit
anything — it shows the profile, how big it is against the ~500-token cap, and where it
needs pruning.

## Run it

```bash
bash "$CLAUDE_SKILLS_DIR/whoami/scripts/whoami.sh"
```

If `$CLAUDE_SKILLS_DIR` is unset, the script lives at `~/.claude-agent/.claude/skills/whoami/`.

## What it shows

- The full profile, rendered.
- **Last updated** timestamp and **size / token estimate** vs the 500-token cap.
- **Per-section counts** across the five schema sections:
  `stable_facts · preferences · working_patterns · recent_corrections · open_threads`.
- A **prune nudge** for the rolling sections (recent_corrections keeps newest 8,
  open_threads keeps newest 6).

## The schema (maintained by memory-curate.cjs)

- **stable_facts** — identity, timezone, environment, tooling (rarely change)
- **preferences** — how the user likes work done
- **working_patterns** — recurring workflows, cadences
- **recent_corrections** — explicit corrections / things that superseded an old belief (newest first)
- **open_threads** — in-flight work to resume

## How to prune

This skill is **read-only**. To prune, edit `memory/USER.md` by hand:
- fold a settled `recent_corrections` entry into `preferences`/`stable_facts` and delete the correction,
- remove `open_threads` that are finished,
- tighten any `stable_facts`/`preferences` that have drifted.

The distiller never deletes core facts — only you do, here. It only trims the rolling
sections to newest-N and enforces the token cap.

## Rules

- Never edit the profile from this skill — it only reports.
- If the profile is over the token cap, surface that first and recommend a prune.
- CLAUDE.md is separate and hand-written — `whoami` shows the *learned* profile, not the rules.
