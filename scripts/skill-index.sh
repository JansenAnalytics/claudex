#!/usr/bin/env bash
# skill-index.sh — generate the skill catalog from SKILL.md frontmatter.
#
# Reads every skills/*/SKILL.md, parses the v2 frontmatter, and emits:
#   - data/skill-index.json    — machine-readable array (consumed by the skill-index meta-skill)
#   - docs/skills-catalog.md    — human-readable catalog grouped by category
#
# Categories are rendered in the canonical order defined below (source of truth:
# docs/skill-anatomy.md). Invalid/unknown categories are surfaced under "(invalid)".
#
# Usage:
#   bash scripts/skill-index.sh                 # write both outputs
#   bash scripts/skill-index.sh --check         # validate only, write nothing, exit 1 on problems
#   bash scripts/skill-index.sh --skills-dir DIR
#
# Env:
#   CLAUDE_SKILLS_DIR — overrides default ~/.claude-agent/.claude/skills

set -euo pipefail

SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}"
ROOT="${CLAUDEX_ROOT:-$HOME/.claude-agent}"
JSON_OUT="$ROOT/data/skill-index.json"
CATALOG_OUT="$ROOT/docs/skills-catalog.md"
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --check)       CHECK_ONLY=1; shift ;;
        --skills-dir)  SKILLS_DIR="$2"; shift 2 ;;
        --json-out)    JSON_OUT="$2"; shift 2 ;;
        --catalog-out) CATALOG_OUT="$2"; shift 2 ;;
        -h|--help)     sed -n '2,/^set -/p' "$0" | sed 's/^# \?//'; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

[[ -d "$SKILLS_DIR" ]] || { echo "skills dir not found: $SKILLS_DIR" >&2; exit 2; }

SKILLS_DIR="$SKILLS_DIR" JSON_OUT="$JSON_OUT" CATALOG_OUT="$CATALOG_OUT" CHECK_ONLY="$CHECK_ONLY" python3 - <<'PY'
import os, sys, json, re

SKILLS_DIR = os.environ["SKILLS_DIR"]
JSON_OUT   = os.environ["JSON_OUT"]
CATALOG_OUT= os.environ["CATALOG_OUT"]
CHECK_ONLY = os.environ["CHECK_ONLY"] == "1"

# Canonical category order + one-line blurb. Source of truth: docs/skill-anatomy.md.
CATEGORIES = [
    ("development",     "Generic dev workflow — git, CI/CD, code review, testing, refactoring"),
    ("frontend",        "UI/UX — React, CSS, accessibility, responsive & visual review"),
    ("backend",         "Server-side — APIs, databases, schema, mocking, perf profiling"),
    ("security",        "Security audits, vuln scanning, secret & credential management"),
    ("research",        "Web/deep research, monitoring, doc reading, hypothesis testing"),
    ("data",            "Data engineering & analysis — ETL, SQL, validation, visualization"),
    ("system",          "OS/infra admin — services, backups, docker, logs, networking"),
    ("comms",           "Person-to-person messaging — Slack, email, push, voice"),
    ("writing",         "Authoring — docs, knowledge bases, ADRs, drafts, prompts"),
    ("productivity",    "Personal org — calendars, notes, tasks, scheduling, clipboards"),
    ("media",           "Image/video/audio — generation, transcription, OCR, screenshots"),
    ("trading-finance", "Markets & money — market data, TA, sentiment, ordering, prop trading"),
    ("home-iot",        "Smart home & local devices — lights, speakers, weather, places"),
    ("meta",            "Self-tooling — skill/model management, MCP, LLM CLIs"),
    ("legal-tech",      "Legal & due diligence — property/commercial DD, registries"),
]
CAT_ORDER = {c: i for i, (c, _) in enumerate(CATEGORIES)}
CAT_BLURB = {c: b for c, b in CATEGORIES}
VALID = set(CAT_ORDER)

def parse_frontmatter(txt):
    m = re.match(r"^---\s*\n(.*?)\n---", txt, re.S)
    if not m:
        return None
    fm = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"^([A-Za-z_]+)\s*:\s*(.*)$", line)
        if not mm:
            continue
        k, v = mm.group(1), mm.group(2).strip()
        fm[k] = v
    return fm

def parse_scalar(v):
    v = v.strip()
    if len(v) >= 2 and v[0] in "\"'" and v[-1] == v[0]:
        v = v[1:-1]
    return v

def parse_array(v):
    v = v.strip()
    if not v:
        return []
    v = v.strip("[]")
    out = []
    for tok in v.split(","):
        tok = tok.strip().strip("\"'").strip()
        if tok:
            out.append(tok)
    return out

skills = []
problems = []
for name in sorted(os.listdir(SKILLS_DIR)):
    d = os.path.join(SKILLS_DIR, name)
    sk = os.path.join(d, "SKILL.md")
    if not os.path.isdir(d) or not os.path.isfile(sk):
        continue
    with open(sk, encoding="utf-8", errors="replace") as f:
        txt = f.read()
    fm = parse_frontmatter(txt)
    if fm is None:
        problems.append(f"{name}: no frontmatter")
        continue
    cat = parse_scalar(fm.get("category", ""))
    mat = parse_scalar(fm.get("maturity", ""))
    if cat not in VALID:
        problems.append(f"{name}: category '{cat or '(missing)'}' not in controlled list")
    support = [s for s in ("scripts", "references", "assets", "data", "tests")
               if os.path.isdir(os.path.join(d, s))]
    skills.append({
        "name": name,
        "description": parse_scalar(fm.get("description", "")),
        "category": cat,
        "maturity": mat,
        "tags": parse_array(fm.get("tags", "")),
        "external_deps": parse_array(fm.get("external_deps", "")),
        "private": parse_scalar(fm.get("private", "")).lower() == "true",
        "has_install": os.path.isfile(os.path.join(d, "INSTALL.md")),
        "support_dirs": support,
    })

if problems:
    sys.stderr.write("⚠️  skill-index found %d problem(s):\n" % len(problems))
    for p in problems:
        sys.stderr.write("   - %s\n" % p)

if CHECK_ONLY:
    sys.exit(1 if problems else 0)

# ── Write JSON index ─────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
with open(JSON_OUT, "w", encoding="utf-8") as f:
    json.dump(skills, f, indent=2, ensure_ascii=False)
    f.write("\n")

# ── Write Markdown catalog ───────────────────────────────────────────────────
by_cat = {}
for s in skills:
    by_cat.setdefault(s["category"], []).append(s)

total = len(skills)
priv = sum(1 for s in skills if s["private"])
lines = []
lines.append("# Claudex Skills Catalog")
lines.append("")
lines.append(f"_Auto-generated by `scripts/skill-index.sh` — do not edit by hand._")
lines.append("")
lines.append(f"**{total} skills** across **{len([c for c,_ in CATEGORIES if by_cat.get(c)])} categories** "
             f"({priv} private 🔒, excluded from the public showcase repo).")
lines.append("")

# Summary table
lines.append("## Summary")
lines.append("")
lines.append("| Category | Count | Covers |")
lines.append("|----------|------:|--------|")
for cat, blurb in CATEGORIES:
    n = len(by_cat.get(cat, []))
    if n == 0:
        continue  # skip empty categories so the table matches the header count and emits no dangling anchor
    lines.append(f"| [`{cat}`](#{cat}) | {n} | {blurb} |")
# any invalid categories
invalid_cats = sorted(set(by_cat) - VALID)
for cat in invalid_cats:
    lines.append(f"| ⚠️ `{cat or '(missing)'}` | {len(by_cat[cat])} | **INVALID — not in controlled list** |")
lines.append(f"| **Total** | **{total}** | |")
lines.append("")

# Maturity rollup
mat_counts = {}
for s in skills:
    mat_counts[s["maturity"] or "(unset)"] = mat_counts.get(s["maturity"] or "(unset)", 0) + 1
lines.append("**Maturity:** " + ", ".join(
    f"{k} {v}" for k, v in sorted(mat_counts.items(), key=lambda kv: -kv[1])) )
lines.append("")
lines.append("---")
lines.append("")

def render_cat(cat, items):
    items = sorted(items, key=lambda s: s["name"])
    out = []
    out.append(f"## {cat}")
    out.append("")
    if cat in CAT_BLURB:
        out.append(f"_{CAT_BLURB[cat]}_ — {len(items)} skill(s)")
    else:
        out.append(f"**⚠️ Invalid category** — {len(items)} skill(s)")
    out.append("")
    out.append("| Skill | Maturity | Description | Tags |")
    out.append("|-------|----------|-------------|------|")
    for s in items:
        mark = " 🔒" if s["private"] else ""
        dep = " ⚙️" if s["external_deps"] else ""
        tags = ", ".join(f"`{t}`" for t in s["tags"])
        desc = s["description"].replace("|", "\\|")
        out.append(f"| **{s['name']}**{mark}{dep} | {s['maturity']} | {desc} | {tags} |")
    out.append("")
    return out

for cat, _ in CATEGORIES:
    if by_cat.get(cat):
        lines += render_cat(cat, by_cat[cat])
for cat in invalid_cats:
    lines += render_cat(cat, by_cat[cat])

lines.append("---")
lines.append("")
lines.append("Legend: 🔒 = private (workspace-only)  ·  ⚙️ = has external project dependency (see the skill's `INSTALL.md`)")
lines.append("")

os.makedirs(os.path.dirname(CATALOG_OUT), exist_ok=True)
with open(CATALOG_OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"✅ Wrote {JSON_OUT} ({total} skills)")
print(f"✅ Wrote {CATALOG_OUT}")
if problems:
    print(f"⚠️  {len(problems)} problem(s) — see stderr above")
PY
