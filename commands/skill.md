---
description: Force-invoke a specific skill by name, bypassing auto-selection
allowed-tools: Bash, Read
argument-hint: <skill-name> [args...]
---

The argument is `<skill-name> [args...]`. Force-load that specific skill and execute it with the given arguments, regardless of whether the description matching would have picked it up.

Steps:

1. **Parse the argument:** first word is the skill name, rest are passed as args/intent.
2. **Verify the skill exists:** `ls ~/.claude-agent/.claude/skills/<skill-name>/SKILL.md`. If it doesn't, say so and (if jq + skill-index.json available) suggest the 3 closest matches by name.
3. **Read the skill's SKILL.md** in full — load its instructions into your reasoning context.
4. **Execute the skill** following its instructions, applying the remaining argument as the user's request/input to that skill.
5. **Return the result** in the format the skill specifies (or Telegram-friendly if unspecified).

When to use this command vs. just stating intent:
- The auto-selector picked the wrong skill and you want to force a specific one
- You're testing a new or experimental skill
- The skill name is shorter than describing what you want (e.g. `/skill weather Oslo` vs. typing out "give me the weather for Oslo")

If the skill body says it requires support files in `scripts/`, `references/`, or `assets/`, use the conventional `$CLAUDE_SKILLS_DIR/<skill-name>/...` path (default `~/.claude-agent/.claude/skills/`).
