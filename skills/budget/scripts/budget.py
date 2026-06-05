#!/usr/bin/env python3
"""budget.py — estimate what is consuming the context window.

Ranks the token weight of the static pieces Claudex auto-loads every session:
CLAUDE.md + rules, MEMORY.md, USER.md, the ~162 skill descriptions (the genuinely
useful + EXACT part — we own skill-index.json), and a rough constant for the system
prompt + tool/MCP schemas (which the harness does not expose to the model).

Token counts are an ESTIMATE. If tiktoken is installed we tokenize with o200k_base
(GPT-4o) — close to, but not identical to, Claude's tokenizer; expect ±10-20% on
absolute totals. The RANKING of heaviest skills is exact regardless of tokenizer.

Usage:
    python3 budget.py            # ranked human-readable breakdown
    python3 budget.py --json     # machine-readable
    python3 budget.py --top N    # show N heaviest skills (default 10)
    python3 budget.py --cost     # also fetch real spend via model-usage/codexbar
"""
import os, sys, json, glob, subprocess

HOME = os.path.expanduser("~")
WS = os.environ.get("CLAUDEX_WORKSPACE", os.path.join(HOME, ".claude-agent"))
INDEX = os.path.join(WS, "data", "skill-index.json")
CLAUDE_MD = os.path.join(WS, "CLAUDE.md")
RULES_GLOB = os.path.join(WS, ".claude", "rules", "*.md")
USER_MD = os.path.join(WS, "memory", "USER.md")
# MEMORY.md lives in the Claude Code auto-memory dir (~/.claude/projects/<slug>/memory/);
# resolve it portably instead of hardcoding the workspace slug.
_mem_cands = sorted(glob.glob(os.path.join(HOME, ".claude", "projects", "*", "memory", "MEMORY.md")))
MEMORY_MD = _mem_cands[0] if _mem_cands else os.path.join(WS, "memory", "MEMORY.md")

# ── tokenizer (tiktoken if present, else chars/4) ────────────────────────────
_ENC = None
_TOKENIZER = "chars/4 (rough)"
try:
    import tiktoken
    _ENC = tiktoken.get_encoding("o200k_base")
    _TOKENIZER = "tiktoken o200k_base (GPT-4o ≈ Claude, ±10-20%)"
except Exception:
    pass

def toks(s):
    if not s:
        return 0
    if _ENC is not None:
        return len(_ENC.encode(s))
    return (len(s) + 3) // 4

def read(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception:
        return ""

# ── parse args ───────────────────────────────────────────────────────────────
args = sys.argv[1:]
as_json = "--json" in args
do_cost = "--cost" in args
top = 10
if "--top" in args:
    try:
        top = int(args[args.index("--top") + 1])
    except Exception:
        top = 10

# ── 1. static files ────────────────────────────────────────────────────────--
components = []

claude_txt = read(CLAUDE_MD)
rules_txt = ""
rules_files = sorted(glob.glob(RULES_GLOB))
for rf in rules_files:
    rules_txt += read(rf)
components.append(("CLAUDE.md + .claude/rules/*.md", toks(claude_txt) + toks(rules_txt),
                   f"{len(rules_files)} rule file(s)"))

components.append(("MEMORY.md (auto-memory index)", toks(read(MEMORY_MD)),
                   os.path.basename(MEMORY_MD)))
components.append(("USER.md (curated profile)", toks(read(USER_MD)),
                   "loaded at SessionStart"))

# ── 2. skill descriptions (the exact, rankable part) ─────────────────────────
skills_rows = []
skill_total = 0
index_ok = os.path.isfile(INDEX)
if index_ok:
    try:
        skills = json.load(open(INDEX, encoding="utf-8"))
    except Exception:
        skills = []
        index_ok = False
    for s in skills:
        name = s.get("name", "?")
        desc = s.get("description", "")
        # context cost ≈ the rendered "- name: description" line the model sees
        line = f"- {name}: {desc}"
        t = toks(line)
        skill_total += t
        skills_rows.append((name, t, len(desc)))
    skills_rows.sort(key=lambda r: -r[1])
components.append((f"Skill descriptions ({len(skills_rows)} skills)", skill_total,
                   "EXACT ranking — from skill-index.json"))

# ── 3. system prompt + tool/MCP schemas (rough constant, not model-visible) ──-
# The harness does not expose the live system prompt or tool schema token counts
# to the model. These are conservative published-order-of-magnitude constants,
# flagged approximate so the totals are not read as authoritative.
SYS_PROMPT_EST = 2500      # Claude Code base system prompt
TOOL_SCHEMA_EST = 9000     # built-in tools + deferred-tool catalog + MCP servers
components.append(("system prompt (rough constant)", SYS_PROMPT_EST, "NOT exact — harness-hidden"))
components.append(("tool + MCP schemas (rough constant)", TOOL_SCHEMA_EST, "NOT exact — harness-hidden"))

grand_total = sum(c[1] for c in components)

# ── optional: real spend ─────────────────────────────────────────────────────
cost_out = None
if do_cost:
    for cmd in (["model-usage", "--today"], ["codexbar", "cost", "--today"]):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if r.returncode == 0 and r.stdout.strip():
                cost_out = r.stdout.strip()
                break
        except Exception:
            continue
    if cost_out is None:
        cost_out = "(model-usage / codexbar not available or returned nothing)"

# ── output ─────────────────────────────────────────────────────────────────--
if as_json:
    print(json.dumps({
        "tokenizer": _TOKENIZER,
        "grand_total_est": grand_total,
        "components": [{"name": n, "tokens": t, "note": note} for n, t, note in components],
        "heaviest_skills": [{"name": n, "tokens": t, "desc_chars": c}
                            for n, t, c in skills_rows[:top]],
        "cost": cost_out,
        "index_present": index_ok,
    }, indent=2))
    sys.exit(0)

def bar(t, mx, width=24):
    n = 0 if mx == 0 else round(width * t / mx)
    return "█" * n + "·" * (width - n)

mx = max((c[1] for c in components), default=1)
print(f"📊 Context budget — ESTIMATE  ·  tokenizer: {_TOKENIZER}")
print("=" * 64)
for name, t, note in sorted(components, key=lambda c: -c[1]):
    pct = 0 if grand_total == 0 else 100 * t / grand_total
    print(f"{t:7,d} tok  {pct:4.1f}%  {bar(t, mx)}  {name}")
    if note:
        print(f"{'':16}{note}")
print("-" * 64)
print(f"{grand_total:7,d} tok  TOTAL (static auto-loaded context, estimate)")
print()
if not index_ok:
    print("⚠️  skill-index.json missing — run scripts/skill-index.sh to rank skills.")
else:
    print(f"🏋️  Heaviest {min(top, len(skills_rows))} skill descriptions (EXACT ranking):")
    for name, t, c in skills_rows[:top]:
        print(f"    {t:4d} tok  ({c:4d} chars)  {name}")
    print()
    print("    → prune/trim these descriptions (or the skills) to cut auto-load weight.")
if cost_out:
    print()
    print("💸 Real spend (today):")
    print("   " + cost_out.replace("\n", "\n   "))
print()
print("Note: system-prompt & tool-schema rows are rough constants — the harness")
print("does not expose live context counts. The skill ranking above is exact.")
