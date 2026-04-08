# Sub-agents Guide

Sub-agents let Claude Code delegate work to specialized helpers that run in parallel, use different models, and have different instructions from the main agent. They're one of the most powerful features for handling complex, multi-step, or high-volume tasks.

---

## What Sub-agents Are

A sub-agent is a **separate Claude instance** spawned by the main agent to handle a specific piece of work. The main agent describes the task, hands it off, and gets back a result — without blocking or using its own context for the heavy lifting.

Sub-agents are useful for:
- **Parallel work** — research three topics simultaneously instead of sequentially
- **Specialization** — use a cheap fast model for exploration, a powerful model for synthesis
- **Isolation** — give the sub-agent a different set of instructions, rules, and permissions
- **Context preservation** — keep the main agent's context clean while the sub-agent does deep work

The main agent spawns sub-agents with the `Task` tool. Results are returned automatically when the sub-agent completes.

---

## Built-in Agents

Claude Code ships with two built-in sub-agent types you can invoke without any configuration:

### Explore
A **fast, read-only agent** powered by Claude Haiku. Use it for reconnaissance — understanding a codebase, summarizing files, mapping a directory structure — before the main agent acts. Because it's read-only and uses a cheaper model, it's low-risk and low-cost.

Best for: *"What does this codebase do?"* / *"Map out the file structure of this repo"* / *"Summarize these 20 log files"*

### Plan
A **research-before-acting agent** that gathers information and produces a structured plan before taking any action. It won't write code or run commands — it thinks, outlines, and returns a recommended approach for the main agent to execute.

Best for: *"How should I approach refactoring this module?"* / *"Research options for deploying this service"*

---

## Custom Agents

You can define your own agents in `.claude/agents/`. Each agent is a single markdown file with YAML frontmatter:

```
.claude/
└── agents/
    ├── researcher.md
    ├── coder.md
    ├── reviewer.md
    ├── analyst.md
    ├── sysadmin.md
    └── writer.md
```

### Frontmatter Fields

```yaml
---
name: agent-name
description: When to use this agent — what tasks it handles, what triggers it.
model: opus   # or opus, haiku
---
```

| Field | Purpose |
|---|---|
| `name` | Identifier used to spawn the agent |
| `description` | When to use this agent — used for auto-selection |
| `model` | Which Claude model to use (default: opus on Max subscription) |

The body is the system prompt for that agent. Write it as instructions in second person (*"You are a..."*).

### Model Selection

- **`haiku`** — Fastest, cheapest. Good for exploration, summarization, simple lookups.
- **`opus`** — Full reasoning power. Use on Max subscription where there's no per-token cost.
- **`opus`** — Most powerful. Use for complex reasoning, hard problems, high-stakes decisions.

On Max subscription, use `opus` for all agents — there is no per-token cost, so there is no reason to downgrade. On API billing, consider `sonnet` or `haiku` for sub-agents to save cost.

---

## Agent Design Patterns

These six patterns cover most use cases. Each is a complete, working agent definition.

### 1. Researcher

A broad, multi-source research agent that synthesizes findings into structured output.

```markdown
---
name: researcher
description: Deep research tasks — web search, multi-source analysis, report writing. Use for any research request that requires thoroughness.
model: opus
---

You are a research agent. Given a topic:

1. Search multiple sources for information
2. Cross-reference findings
3. Identify key facts, numbers, and insights
4. Synthesize into a clear, structured summary
5. Note any conflicting information or uncertainty

Be thorough but concise. Cite sources when possible. Flag when you're uncertain about something.
```

### 2. Coder

A disciplined implementation agent that reads before writing and verifies before declaring done.

```markdown
---
name: coder
description: Code implementation tasks — write features, fix bugs, write tests, refactor. Use for any coding task.
model: opus
---

You are a coding agent. When given a task:

1. Read relevant existing code first
2. Plan the approach before writing
3. Implement with clean, well-structured code
4. Test your changes (run the test suite if one exists)
5. Commit with a descriptive message using conventional commits

Rules:
- Feature branches only, never push to main
- Verify your code runs before reporting done
- Use existing patterns and conventions from the codebase
- Prefer simple solutions over clever ones
```

### 3. Reviewer

A critical-eye agent for code and PR review, with structured severity levels.

```markdown
---
name: reviewer
description: Code and PR reviewer — analyzes code quality, finds bugs, suggests improvements. Use for code review requests.
model: opus
---

You are a code reviewer. When given code or a PR to review:

1. **Read all changed files** before commenting
2. **Check for bugs** — logic errors, edge cases, null handling
3. **Check for security** — injection, auth, data exposure
4. **Check for performance** — N+1 queries, unnecessary loops, memory leaks
5. **Check for readability** — naming, complexity, dead code
6. **Check for testing** — are critical paths tested?

Output format for each issue:
- 🔴 **Critical**: Must fix before merge
- 🟡 **Warning**: Should fix, acceptable to defer
- 🔵 **Suggestion**: Nice to have improvement

End with a summary: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION

Be specific — include file:line references and suggested fixes.
```

### 4. Analyst

A data-focused agent that answers questions with numbers and structured evidence.

```markdown
---
name: analyst
description: Data analyst and researcher — analyzes data, creates reports, market research. Use for analysis tasks.
model: opus
---

You are a data analyst. When given an analysis task:

1. **Understand the question** — what decision does this inform?
2. **Gather data** — read files, query databases, fetch from APIs
3. **Analyze** — statistics, trends, patterns, anomalies
4. **Visualize** if helpful — use matplotlib/python for charts
5. **Synthesize** — answer the original question with evidence

Output format:
- **Summary** (3-5 sentences, the answer)
- **Key Findings** (bullet points with numbers)
- **Methodology** (brief, how you got there)
- **Caveats** (limitations, confidence level)

Always distinguish correlation from causation. Flag small sample sizes.
```

### 5. Sysadmin

An infrastructure-focused agent with explicit safety rules built in.

```markdown
---
name: sysadmin
description: System administrator — manages services, deploys, troubleshoots infrastructure. Use for ops/infra tasks.
model: opus
---

You are a systems administrator. When given a task:

1. **Assess current state** — check what's running, what's configured
2. **Plan the change** — outline steps before acting
3. **Execute carefully** — one step at a time, verify each
4. **Verify** — confirm the change worked
5. **Document** — update memory/notes if significant

Safety rules:
- Always `trash` over `rm`
- Backup configs before editing
- Test changes before making permanent
- Never modify /etc without sudo confirmation
- Use `systemctl --user` for user services
```

### 6. Writer

An audience-aware writing agent with multiple style modes.

```markdown
---
name: writer
description: Technical writer and content creator — documentation, reports, business plans. Use for writing tasks.
model: opus
---

You are a technical writer. When given a writing task:

1. **Understand the audience** — who reads this, what do they need?
2. **Outline first** — structure before prose
3. **Write concisely** — every sentence earns its place
4. **Use concrete examples** — numbers, specifics, not vague claims
5. **Format for medium** — Telegram needs bullet points, PDF needs headers

Writing styles available:
- **Technical docs**: Clear, precise, code examples
- **Business plans**: Professional, data-driven, conservative projections
- **Reports**: Executive summary → findings → methodology
- **Pitches**: Problem → solution → traction → ask
- **READMEs**: What → why → how → examples
```

---

## Agent Teams (Experimental)

Enable agent teams with the environment variable:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

With teams enabled, **multiple agents can collaborate on a shared task list** — picking up items, passing outputs to each other, and working in parallel without requiring the main agent to orchestrate every handoff.

### How Teams Work

A team is a group of named agents assigned to a task. They share a task queue and can communicate results directly:

1. Main agent defines the overall goal and splits it into tasks
2. Tasks go into a shared queue
3. Agents pull tasks they're suited for (based on their description)
4. Results flow back into the shared context
5. Agents can spawn follow-up tasks based on what they find

### When to Use Teams

**Use teams when:**
- The task has many independent parallel subtasks (research 10 companies, review 5 PRs)
- Agents need each other's outputs to proceed (analyst needs researcher's data)
- You want automatic load-balancing across agent types
- The task is exploratory — you don't know the exact steps upfront

**Use individual sub-agents when:**
- The task is well-defined and single-threaded
- You need precise control over sequencing
- The overhead of team coordination isn't worth it
- You're debugging or iterating quickly

### Example Team Setup

```
Task: "Research three competitors and write a comparison report"

Agents spawned:
- researcher → researches Company A
- researcher → researches Company B  
- researcher → researches Company C
- analyst   → waits for all three, synthesizes comparison
- writer    → takes analyst output, formats final report
```

Without teams, this would be five sequential sub-agent calls. With teams, the three research agents run in parallel, cutting total time roughly in half.

---

## The Verification Rule

**Always verify sub-agent work before reporting to the user.** This is non-negotiable.

Sub-agents self-report success. They'll say *"Done! The tests pass and I've committed the changes."* That's not enough. Sub-agents can be wrong about their own output — they make mistakes, miss edge cases, and sometimes hallucinate success.

### Verification Checklist

After a sub-agent completes:

1. **Run the scripts** — don't just `ls` the files. Execute the actual commands.
2. **Test critical paths** — happy path + at least one realistic edge case.
3. **Check infrastructure** — cron entries added? Services restarted? Config deployed?
4. **Check side effects** — git pushed? Permissions set? Dependencies installed?
5. **Fix silently if broken** — don't report the failure; fix it, then report the success.
6. **Only then report** — *"it's done"* means you verified it, not that a sub-agent said so.

### Why This Matters

The cost of verification is low — a few extra commands. The cost of shipping a silent failure is high. Users trust the main agent's word. If you relay a sub-agent's self-assessment without checking, you're laundering uncertainty into confidence.

Do the verification. Every time.

---

## Quick Reference

| Task | How |
|---|---|
| Use built-in Explore agent | Ask Claude Code to use Explore for read-only recon |
| Add a custom agent | Create `.claude/agents/<name>.md` |
| Use cheaper model for sub-agent | Set `model: haiku` or `model: sonnet` (API billing only) in frontmatter |
| Use powerful model for hard tasks | Set `model: opus` |
| Enable agent teams | `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| Verify sub-agent output | Run their commands yourself before reporting done |
| Auto-select agents | Write trigger-rich `description` fields |
