# Writing an Effective CLAUDE.md

CLAUDE.md is the first thing Claude reads when a session starts. It's your agent's DNA — defining who it is, who it's helping, what it's allowed to do, and how it should behave. A weak CLAUDE.md produces a generic assistant. A strong one produces a capable collaborator that knows your context cold.

---

## Purpose

Every session, Claude wakes up fresh. CLAUDE.md is how you give it memory of who it is and what matters. Think of it less as documentation and more as identity. Without it, Claude defaults to polite, cautious, and generic. With it, Claude can be specific, opinionated, and actually useful.

---

## Loading Behavior

Claude Code reads CLAUDE.md from:
1. **Workspace root** — `~/your-workspace/CLAUDE.md` (always loaded)
2. **Hidden config dir** — `.claude/CLAUDE.md` (loaded if present; use for overflow or project-specific additions)

The file stays in context for the entire session. It doesn't need to be re-read — it's always there. Keep it focused: context budget is finite, and a bloated CLAUDE.md squeezes out room for actual work.

---

## Section-by-Section Guide

### Identity

Who is this agent? Give it a name, personality traits, and a voice. Specificity matters.

```markdown
## Identity
Name: Aria. Direct, technically precise, occasionally dry. 
Prefers short answers when context allows. Does not hedge unnecessarily.
```

Vague instructions like "be helpful and friendly" produce nothing. "Direct, technically precise, occasionally dry" shapes actual output.

### User Context

Tell Claude who it's talking to. The more it knows about you, the better it can calibrate.

```markdown
## User
Name: Alex. Senior backend engineer, Go/Python. 
Timezone: Europe/Berlin. Prefers metric units.
Communication style: terse. Skip preamble, get to the answer.
```

Include timezone, expertise level, communication preferences, and anything that affects how Claude should respond. This isn't biographical — it's calibration data.

### Operating Rules

How autonomous should Claude be? What requires confirmation? What's forbidden?

```markdown
## Operating Rules
- Run read-only commands freely. Ask before writes.
- Never send external messages without explicit permission.
- Don't delete files; use trash. 
- Commit and push code freely unless it's a main/prod branch.
```

Be concrete. "Use good judgment" is not a rule. "Ask before pushing to main" is.

### Projects

Key projects with enough context to orient Claude immediately.

```markdown
## Projects
- **api-service** — ~/projects/api-service, branch: feature/auth, Go 1.22
  Key files: cmd/server/main.go, internal/auth/jwt.go
- **infra** — ~/projects/infra, Terraform, state in S3 bucket prod-tf-state
```

If Claude knows where your projects live and what's important in them, it won't waste turns asking.

### Tools

Your preferred CLI tools, environment details, aliases.

```markdown
## Tools
- Editor: nvim. Terminal: tmux. Shell: zsh.
- Use `bat` for file display, `rg` for search, `fd` for find.
- Docker is available. k8s cluster accessible via kubectl (context: prod-cluster).
```

This prevents Claude from defaulting to `cat` and `grep` when you have better tools available.

### Communication Rules

Platform-specific formatting matters more than you'd think.

```markdown
## Communication Rules
- Telegram: no markdown tables. Use bullet lists. No HTML.
- Keep messages short enough to read on mobile.
- Use code blocks for all commands and file paths.
- No unnecessary affirmations ("Great question!", "Sure!", etc.)
```

If you use Telegram, note that it renders a limited subset of Markdown. Tables don't work. Long messages are painful. If you use Discord, suppress link embeds with `<url>`. Match the rules to the platform.

### Sub-agent Instructions

When should Claude delegate to a sub-agent vs handle inline?

```markdown
## Sub-agents
Spawn a sub-agent for tasks that:
- Take more than ~5 minutes of work
- Are fully self-contained (no need for back-and-forth)
- Involve writing large amounts of code or docs

After sub-agent work: verify the output yourself before reporting back.
```

The verification rule is critical. Sub-agents self-report success — that's not enough. Claude should confirm the work is actually done.

### Security

What's off-limits. What requires explicit permission.

```markdown
## Security
- Never exfiltrate private data from MEMORY.md or workspace files.
- Do not post to social media or send emails without confirmation.
- Production deployments: always confirm before running.
- SSH to external hosts: ask first.
```

---

## Mapping from OpenClaw

If you're migrating from an OpenClaw setup, here's how the pieces map:

| OpenClaw File | CLAUDE.md Section |
|---|---|
| `SOUL.md` | Identity section |
| `USER.md` | User Context section |
| `TOOLS.md` | Tools section |
| `AGENTS.md` conventions | Operating Rules + Sub-agent Instructions |
| Skill `SKILL.md` headers | Don't copy — reference the skill instead |
| `MEMORY.md` | Don't copy — Claude Code reads this separately |

Don't paste entire files in. Extract the relevant facts and rewrite them as concise CLAUDE.md sections.

---

## Tips

**Keep it under ~4000 words.** Every token in CLAUDE.md is a token not available for actual work. Cut anything that's aspirational rather than actionable.

**Be specific, not aspirational.** "Be proactive" means nothing. "Check git status at the start of a coding session" means something.

**Update it as you learn.** The first version will be wrong. After a few sessions, you'll know what Claude keeps misunderstanding — fix it in the file, not in the chat.

**Include project context.** The projects section is underrated. Knowing branch names, key files, and tech stack saves multiple turns per session.

**Don't duplicate skills.** If you have a skill for code review, CLAUDE.md doesn't need to describe the review process — just reference it. CLAUDE.md is for identity and context, not procedure.

**Test it.** Start a session and ask Claude: "What do you know about me?" and "What are you not allowed to do?" The answers will reveal gaps fast.

---

## Minimal Starter Template

```markdown
# CLAUDE.md

## Identity
[Name, personality, voice]

## User
[Name, timezone, expertise, communication style]

## Operating Rules
[Autonomy level, confirmation triggers, forbidden actions]

## Projects
[Active projects with locations and key context]

## Tools
[Preferred CLI tools, environment details]

## Communication Rules
[Platform formatting, response length, tone]

## Security
[Off-limits actions, things that need permission]
```

Start here. Add sections as you discover what's missing. Delete what you never use.
