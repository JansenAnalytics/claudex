---
name: verifier
description: Double-model verification gate before declaring a build/research/refactor "done". Runs a fresh Anthropic (Claude) review AND an independent OpenAI/Azure critic against the stated goal + criteria, then reconciles. Use before announcing completion of medium/major builds, refactors, major fixes, research deliverables, frontend work, or trade-decision rigor — and on demand via /verify. Skip for small Q&A and trivial edits.
category: development
maturity: beta
tags: [verification, cross-model, quality-gate, code-review, research-review, karpathy-method, openai, azure, codex]
---

# verifier — Double-Model Verification (Karpathy Layer 2)

Catches "done when it isn't", shallow/unverified claims, code bugs, frontend bugs, weak trade rigor, and
output that falls short of the **stated goal** — by checking the work with **two independent models** and only
clearing it when they agree. See design: `research/2026-06-14-cross-model-verifier-spec.md`.

## When to run (in scope)
Medium/major builds, refactors, major fixes, research/analysis deliverables, repo work, frontend changes,
trade-decision rigor — **before you tell the user "done"**. Also any time on demand.
**Skip** for small Q&A, trivial one-line edits, and anything where verification is overkill.

## The flow (do all five — this is the gate)

**1. State the goal + evaluation criteria UP FRONT.** Before judging, write the concrete acceptance criteria
("what good looks like"). Precise, testable. This is the rubric both models grade against.

**2. Layer A — independent Anthropic review.** Spawn a FRESH Claude subagent (e.g. `reviewer` for code,
`researcher`/`analyst` for research) — not your own builder context — and have it grade the artifact against the
criteria, returning the verdict shape below. A fresh subagent reduces "builder grading its own homework."

**3. Layer B — independent cross-model critic.** Run the external engine (different model family → different
blind spots). **Always pass a `--profile`** so the critic grades in context (this is what stops it over-flagging
theoretical, unreachable issues — see "Context profiles & the gate" below):
```bash
export OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' ~/.claude-agent/.env | cut -d= -f2-)"
node ~/.claude-agent/scripts/verifier/verify.cjs \
  --profile curation-helper|trading|public-web|default \
  --goal "<the stated goal>" \
  --criteria "criterion 1; criterion 2; criterion 3" \
  --scope code|research|frontend|trade|general \
  --target <path | - | "inline text"> \
  --depth medium|major \
  [--invariants "must not drop data; must stay backward-compatible"] \
  [--non-goals "handling untrusted multi-MB input"]
```
- `--target -` reads the artifact from stdin (e.g. `git diff | node verify.cjs --target - ...`).
- Depth tiers: **medium** → api backend `gpt-5.4`; **major** → escalate (`--depth major` = `gpt-5.5`, or
  `--backend codex --model gpt-5.3-codex` for deep code review). Override per task: `--model`, `--backend`,
  `--provider openai|azure-foundry`.
- Output is one structured **verdict** JSON (see schema). Cost is logged to `data/verifier-spend.jsonl` and
  capped at the configured monthly budget (`config/verifier.json`, default $200; refuses when exceeded).

**4. Reconcile A vs B — act on BLOCKING findings only.**
- The engine splits findings into **`blocking`** (applies in context AND blocks the goal AND reachable) and
  **`advisory`** (theoretical / out-of-context / nice-to-have). **Only blocking findings must be fixed before
  "done."** Advisory findings are FYI — note them, don't chase them (chasing advisory items is exactly the
  over-correction failure this design fixes).
- **No blocking findings from A or B** → cleared. Report done (mention any accepted advisories).
- **Blocking findings** → fix them, re-run the gate (cap at ~3 rounds; then escalate).
- **A and B disagree on a blocking finding** → investigate; if unresolved, **escalate to the user with both
  verdicts** rather than silently picking one.
- **`invariant_conflicts` non-empty** → a fix would violate a stated invariant. **Never apply it.** Report the
  tension to the user.
- **Engine returns `verdict:"error"`** (budget/auth/network) → you did NOT verify. Say so explicitly; never
  treat unverified as passed.

> ⚠️ Judgment stays with you (the orchestrator). The critic detects and grades; it does NOT own the standard —
> risk appetite, accepting tradeoffs, and rejecting a harmful "fix" are your call. If the critic recommends
> something that breaks the goal/an invariant, reject it (that's not a bug, that's the design).

**5. Report.** Only tell the user "done" after reconciliation clears, and include the verdict summary (score vs goal
+ any accepted residual warnings).

## Verdict shape (both layers use it)
```json
{ "verdict": "pass|warn|fail", "score_vs_goal": 0-100,
  "criteria": [{"name","met","note"}],
  "findings": [{"severity":"high|med|low","title","evidence","fix"}],
  "summary": "..." }
```

## Context profiles & the gate (why it doesn't over-flag)

`config/verify-profiles/*.json` supply the context that decides which findings matter — input provenance/trust,
threat model, scale, **non-goals**, **invariants**, and **excluded concern classes**. Pick by what's being
verified:
- **`curation-helper`** — code that parses/transforms our own bounded model output (trusted, small). DoS/
  complexity is unreachable → advisory.
- **`trading`** — prop-hedge / financial logic. Correctness & numerical accuracy paramount; never mask errors.
- **`public-web`** — anything handling untrusted external input. FULL threat model — security/DoS findings DO block.
- **`default`** — generic internal code.

The engine **computes the verdict from structured fields, not the model's prose** (hard gating): a finding blocks
only if `applies_in_context && blocks_goal && reachable!='no' && !violates_invariant`. Add `--invariants`/
`--non-goals` for anything not captured by the profile. If no profile fits well, make a new one (copy `default`).

## Provider / model swap
Default provider = OpenAI (reuses `OPENAI_API_KEY`). Swap to Azure Foundry with `--provider azure-foundry` once
`config/verifier.json` + `.env` (`AZURE_OPENAI_API_KEY`) are filled in. Codex backend swaps via its
`~/.codex/config.toml` `azure` profile. Provider/model/backend are all config- or flag-selectable per task.

## Cost discipline
- Default `gpt-5.5` (~$0.015/verification; verifier quality > cost, and it only fires on medium/major work);
  `gpt-5.4-mini`/`-nano` via `--model` for cheap high-volume pre-filtering; `gpt-5.3-codex` for deep code review.
- Send diffs/excerpts, not whole repos. The engine enforces `max_output_tokens` and the monthly ceiling.

## Notes
- Layer B is an external process by necessity: Claude Code subagents cannot run non-Anthropic models.
- This is advisory-but-mandatory: the verdict doesn't hard-block tools, but the gate (running it + resolving
  findings) is required before a "done" claim on in-scope work. Hard tool-level guardrails are a separate
  (deferred) security track.
