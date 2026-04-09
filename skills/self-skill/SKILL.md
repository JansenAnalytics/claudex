---
name: self-skill
description: "Meta-skill for detecting when a solved problem is worth packaging as a reusable skill, then scaffolding it. Runs automatically after completing any non-trivial task. Also use when explicitly asked to create, draft, or propose a new skill from something just built."
---

# Self-Skill — Autonomous Skill Creation

## When This Runs

**Automatically** — after every non-trivial task, run the 5-question filter mentally:

1. Will this come up again?
2. Did I have to look something up or think hard?
3. Did I write more than 20 lines of non-trivial code?
4. Does it involve a specific tool/API with non-obvious usage?
5. Would Aksel benefit from knowing how to trigger this?

**2+ yes answers → create or propose a skill.**

See [references/heuristics.md](references/heuristics.md) for the full decision framework.

---

## Scaffold a New Skill

```bash
bash /home/ajans/openclaw/skills/self-skill/scripts/draft-skill.sh <name> \
  --desc "what it does in plain language" \
  --resources "scripts,references"
```

This creates the full directory structure and pre-fills SKILL.md.

---

## Full Skill Creation Checklist

When creating a skill (auto or on request):

```
[ ] 1. Run draft-skill.sh to scaffold the structure
[ ] 2. Write SKILL.md — description, triggers, quick reference
[ ] 3. Write scripts/ — working, tested, standalone
[ ] 4. Write references/ — detailed docs for complex topics
[ ] 5. Test all scripts before documenting them
[ ] 6. Write <skill-name>-guide.md in workspace (plain language, Aksel-facing)
[ ] 7. Send guide as Telegram file attachment
[ ] 8. Paste raw guide markdown in chat — ONE continuous code block (split max 2 if too long)
[ ] 9. Commit: git add -A && git commit -m "feat: add <name> skill"
```

---

## Auto-Create vs Propose

**Auto-create** (just do it, mention at end of task):

- Already wrote non-trivial scripts during the task
- Obvious extension of what was just built
- Scaffolding takes < 2 minutes

**Propose first** ("I should make a skill for this — want me to?"):

- Uncertain if pattern is stable
- Would require significant extra work
- Task was exploratory

---

## Trigger Phrases

These will activate this skill:

- "Make a skill for this"
- "Turn this into a skill"
- "Save this as a skill"
- "We should have a skill for that"
- _(automatically after any non-trivial task)_
