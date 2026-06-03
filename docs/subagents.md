# Subagents

Claudex can delegate multi-step work to specialized subagents. Each runs in its **own context window** with a focused system prompt — useful when a task is big enough to pollute the main thread, or benefits from a narrow, opinionated persona. Agent definitions live in `$HOME/.claude-agent/.claude/agents/<name>.md` (frontmatter: `name`, `description`, `model`; body = the agent's system prompt).

All 9 agents currently run on `claude-opus-4-8`.

## The 9 agents

- **analyst** — Data analysis and market research. Reads files/DBs (trade-journal.db, brewboard tokens), runs stats, visualizes, synthesizes. Outputs Summary / Key Findings / Methodology / Caveats; flags small samples and correlation-vs-causation. **Use for:** "analyze this data", "what do the numbers say".

- **coder** — Feature implementation, bug fixes, tests, refactors. Reads existing code first, plans, implements to existing conventions, runs tests, commits with conventional messages on a feature branch (never main). **Use for:** any code-writing task.

- **researcher** — Deep, multi-source research. Searches broadly (`web_search`), reads deeply (`web_fetch`), cross-references, flags conflicts and uncertainty. Outputs Summary / Key Findings (cited) / Confidence per finding / Sources. **Use for:** "research X thoroughly", anything needing more than one source.

- **reviewer** — Code/PR review. Reads the full diff, then checks bugs, security, performance, readability, and test coverage. Outputs severity-tagged issues (🔴 Critical / 🟡 Warning / 🔵 Suggestion) and a verdict (APPROVE / REQUEST CHANGES / NEEDS DISCUSSION) with file:line refs. **Use for:** reviewing a PR or diff before merge.

- **sysadmin** — Ops/infra on the user's WSL2 box. Assesses current state, plans, executes one step at a time, verifies, documents. Knows systemd user services, cron, gh. `trash` over `rm`, backs up configs, never touches `/etc` without sudo confirmation. **Use for:** services, deploys, infra troubleshooting.

- **writer** — Technical writing and content. Identifies audience, outlines, writes concise prose with concrete numbers, formats for medium (Telegram bullets / markdown / formal PDF via LaTeX). Handles docs, business plans, reports, pitches, READMEs. **Use for:** anything prose-heavy meant for a human reader.

- **tester** — Runs test suites and makes them *meaningful*, not just green. Detects the framework from config (no assumptions), runs, classifies failures (flaky vs real, test-bug vs code-bug), proposes fixes, re-runs, and flags meaningless or missing tests. Never `.only()`s or deletes a test to force a pass. **Use for:** running tests, failing CI, verifying a change beyond static review.

- **incident-responder** — Diagnoses production incidents for **root cause, not first-plausible cause**. Gathers signals before theorizing (logs, metrics, health checks), builds a timeline against `git log`/deploys, forms ≥2 ranked hypotheses, tests the leading one with a minimal repro (read-only first), proposes the smallest-blast-radius fix, writes a 5-line post-mortem. Never restarts as a first move; "transient issue" without evidence is banned. **Use for:** a service that's broken, erroring, or behaving oddly.

- **documentarian** — Writes/updates inline docs, READMEs, API refs **after** a code change. Reads the surrounding module (not just the diff), matches the project's existing doc style, documents the *why* when non-obvious, updates rather than accumulating contradictory docs, verifies examples still run, and flags code too complex to document as a refactor signal. **Use for:** docs catching up to code, or an undocumented module.

### Quick picker

- Numbers → **analyst**. Prose → **writer**. Facts from the web → **researcher**.
- Write code → **coder**. Judge code → **reviewer**. Exercise code → **tester**.
- Server's on fire → **incident-responder**. Server needs changing → **sysadmin**.
- Code shipped, docs lag → **documentarian**.

---

## Skill vs Subagent vs Slash Command vs Hook

Four extension types, four different jobs. The fastest way to pick: ask **who triggers it** and **whether it needs its own context**.

| Type | Triggered by | Runs in | Core question it answers |
|---|---|---|---|
| **Skill** | the model, on demand | the current context | "I need domain knowledge/a procedure to do this well" |
| **Subagent** | the model, by delegation | a fresh context window | "This is big enough that I want it off my main thread" |
| **Slash command** | the user, by name | the current context | "I run this exact prompt often enough to name it" |
| **Hook** | the harness, on an event | a shell process (no model) | "This must happen automatically and deterministically" |

*(Table is for the docs file — Telegram replies use bullets instead.)*

### SKILL — reusable knowledge the model loads on demand

A skill is a folder of instructions/scripts the model **chooses** to pull in when a task matches its description. It does not get its own context window; it augments the current one. Think "expertise on tap."

- **Reach for it when:** the same *procedure or domain knowledge* recurs (how to query a database, how to format a morning briefing, how to drive a project-specific CLI), and you want the model to apply it inline.
- **Don't use it for:** one-off prompts (slash command), heavyweight delegated work (subagent), or anything that must fire without the model deciding (hook).
- **Examples here:** `memory-search`, `data-analysis`, `morning-briefing`, `cron-dashboard`, `skill-index`. 160 of them under `.claude/skills/`.

### SUBAGENT — delegated multi-step work in its own context

A subagent is a *whole separate run* with its own system prompt and **its own context window**. The main thread hands off a task, the subagent works in isolation, and only its final report comes back. This keeps large or noisy work from bloating the main conversation.

- **Reach for it when:** the work is multi-step and self-contained (review a 30-file PR, research a topic across many sources, refactor a module, diagnose an incident). Especially when you'd otherwise burn the main context on intermediate file reads and dead ends.
- **Parallelism:** independent subagents can run concurrently — fan out a researcher + an analyst + a reviewer at once.
- **Don't use it for:** a quick edit or single file read (just do it inline — spawning a context is overhead), or anything the *user* should trigger by name (that's a slash command).
- **Verify the output.** House rule: don't trust a subagent's self-reported success — test it yourself.
- **Examples here:** the 9 agents above.

### SLASH COMMAND — a fixed prompt the user triggers by name

A slash command is a saved prompt in `.claude/commands/<name>.md`, invoked by the **user** typing `/name`. The body is sent to the model as the prompt; `$ARGUMENTS` / `$1`, `$2` carry user input. Same context as the conversation — it's just a named, reusable prompt with declared `allowed-tools`.

- **Reach for it when:** *you (the user)* run the same request repeatedly and want a one-word trigger — `/audit`, `/handoff`, `/status`. The trigger is human; the steps are fixed.
- **Vs skill:** a skill is knowledge the *model* loads when relevant; a slash command is a prompt the *user* fires deliberately. A slash command can (and often does) tell the model to invoke skills or spawn subagents.
- **Don't use it for:** behavior that must happen automatically (hook) or knowledge the model should reach for on its own (skill).
- **Examples here:** `/audit` (composite health report), `/handoff` (write a memory file + Telegram summary).

### HOOK — deterministic automation the harness runs on an event

A hook is a shell command the **Claude Code harness** runs on a lifecycle event (e.g. before a tool call, on session start/stop, on file write). It is **not the model** — it's deterministic plumbing configured in `settings.json`. It always fires; it can't "decide" not to.

- **Reach for it when:** something must happen *every time*, reliably, without depending on the model remembering — auto-format on write, block edits to a protected path, run an indexer after a session, append to the event log on a tool call.
- **Vs everything else:** the other three involve the model's judgment. A hook removes judgment on purpose — that's the point. "From now on, whenever X happens, do Y" without exception = hook, not a memory note.
- **Don't use it for:** anything requiring reasoning or natural-language output (that needs the model → skill/subagent/slash command).
- **Note:** the model cannot author hooks for itself ad hoc; hooks are configured via the harness (`update-config` skill / `settings.json`).

### One-line decision tree

1. **Must it fire automatically, every time, no reasoning?** → **Hook**.
2. **Does the *user* trigger it by name with a fixed set of steps?** → **Slash command**.
3. **Is it big, multi-step, self-contained, and worth isolating from the main thread?** → **Subagent**.
4. **Is it recurring knowledge/a procedure the model should apply inline?** → **Skill**.
5. **None of the above (small, one-off, in-context)?** → just do it directly — no extension needed.

### Worked examples

- *"Every time I save a `.py` file, run black."* → **Hook** (deterministic, no model judgment).
- *"Review this PR for security issues."* → **Subagent** (`reviewer` — multi-step, isolated context).
- *"Give me the standard health audit."* → **Slash command** (`/audit` — user-triggered fixed prompt).
- *"Summarize this CSV and chart the top categories."* → **Skill** (`data-analysis` — domain procedure the model loads).
- *"Fix this one typo in line 12."* → none — just **Edit** it inline.
- *"Research the 2026 forex prop-firm landscape, then summarize."* → **Subagent** (`researcher`), optionally pulling the `deep-research` **skill**.
