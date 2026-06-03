# Self-Skill Heuristics — Is This Worth a Skill?

## The Core Test

After completing any non-trivial task, ask:

> "Will I need to do something like this again? And is the how non-obvious enough that I'd have to figure it out again from scratch?"

If yes to both → skill candidate.

---

## The 5-Question Filter

Run through these after completing a task. Two or more "yes" answers = create the skill.

| #   | Question                                                        | Why it matters                                    |
| --- | --------------------------------------------------------------- | ------------------------------------------------- |
| 1   | **Will this come up again?**                                    | One-offs don't need skills. Patterns do.          |
| 2   | **Did I have to look something up or think hard?**              | If it was obvious, it doesn't need documentation. |
| 3   | **Did I write more than 20 lines of non-trivial code?**         | Small scripts worth preserving.                   |
| 4   | **Does it involve a specific tool/API with non-obvious usage?** | Tool knowledge decays between sessions.           |
| 5   | **Would the user benefit from knowing how to trigger this?**       | If the interaction pattern matters, document it.  |

---

## Strong "Create a Skill" Signals

- Built a working script that will be used again (monitoring, notifications, scrapers)
- Figured out a non-obvious API, library, or system interaction
- Invented a multi-step workflow that's now repeatable
- Discovered environment-specific gotchas (WSL quirks, path issues, cron behavior)
- Created something the user explicitly said they want to reuse or reference

## Strong "Don't Bother" Signals

- Pure one-off task with no reusable component
- Everything I did was standard and obvious (e.g. basic git commands)
- The task was already covered by an existing skill
- The "skill" would just be a list of curl commands with no logic
- the user won't trigger it — it's internal plumbing only

---

## Auto-Create vs Propose

### Auto-create (just do it, mention at the end)

- I already wrote non-trivial scripts during the task
- The skill is an obvious extension of what I just built
- The scaffolding takes < 2 minutes

### Propose first (say "I should make a skill for this — want me to?")

- Uncertain if the user wants this formalized
- The skill would require significant extra work beyond what's already done
- The task was exploratory and I'm not sure the pattern is stable yet

---

## Skill Naming Conventions

| Pattern                                | Example                                         |
| -------------------------------------- | ----------------------------------------------- |
| Tool/service name                      | `ntfy`, `github-workflow`, `website-screenshot` |
| What it does                           | `stock-watcher`, `web-monitor`, `self-skill`    |
| Avoid: `my-`, `kite-`, version numbers | ~~`my-ntfy-skill`~~, ~~`ntfy-v2`~~              |

Use hyphens, all lowercase, short and specific.

---

## What Goes in Each File

### SKILL.md (required)

- One-line description (used by the skill selector)
- Trigger phrases — what the user says to activate it
- Quick reference — the most common commands/usage
- Pointers to reference files for detail

### scripts/ (when there's executable code)

- Self-contained scripts that do the actual work
- Each script should work standalone via CLI
- Document args with comments at the top

### references/ (when there's complex detail)

- One file per major topic area
- Full API reference, config options, examples
- Things too detailed for SKILL.md but needed occasionally

### Guide (always required)

- `<skill-name>-guide.md` in the workspace
- Plain language, written for the user to read and understand
- Send as Telegram file + paste raw markdown in chat (one block)
