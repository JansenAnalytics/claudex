#!/usr/bin/env bash
# skill-audit.sh — audit every skill in a skills directory.
#
# Validates each SKILL.md against the v2 schema (Phase 3+):
#   - required:  name, description, category, maturity
#   - optional:  tags, external_deps, private
#   - category must be one of the 15 controlled categories (see docs/skill-anatomy.md)
#   - maturity must be one of: experimental, beta, stable, deprecated
#
# Also reports:
#   - presence of support subdirs (scripts/ references/ assets/ data/ tests/)
#   - external path references in SKILL.md body (~/projects/, /home/, ~/openclaw/)
#   - SKILL.md size warnings (>5 KB)
#   - INSTALL.md presence when external_deps is non-empty (or external paths exist)
#
# Output: human-readable text by default, JSON with --json.
# Exit code: 0 if all skills pass; 1 if any have errors.
#
# Usage:
#   bash scripts/skill-audit.sh
#   bash scripts/skill-audit.sh --json
#   bash scripts/skill-audit.sh --skills-dir /path/to/skills
#   bash scripts/skill-audit.sh --quiet         # only show problems
#   bash scripts/skill-audit.sh --skill weather # audit a single skill
#
# Env:
#   CLAUDE_SKILLS_DIR — overrides default ~/.claude-agent/.claude/skills

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}"
MODE="text"          # text | json
QUIET=0              # 1 = only show skills with problems
SINGLE_SKILL=""      # empty = audit all
SIZE_WARN_BYTES=5120 # warn if SKILL.md > 5 KB

REQUIRED_FIELDS=(name description category maturity)
OPTIONAL_NEW_FIELDS=(tags external_deps private)
VALID_MATURITY=(experimental beta stable deprecated)
# The 15 controlled categories. Source of truth: docs/skill-anatomy.md.
VALID_CATEGORIES=(development frontend backend security research data system comms writing productivity media trading-finance home-iot meta legal-tech)
SUPPORT_DIRS=(scripts references assets data tests)
EXTERNAL_PATH_REGEX='(~/projects/|~/openclaw/|/home/[a-zA-Z0-9_]+/)'

# ─── Arg parsing ─────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --json)        MODE="json"; shift ;;
        --quiet)       QUIET=1; shift ;;
        --skills-dir)  SKILLS_DIR="$2"; shift 2 ;;
        --skill)       SINGLE_SKILL="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,/^set -/p' "$0" | sed 's/^# \?//'
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

if [[ ! -d "$SKILLS_DIR" ]]; then
    echo "skills dir not found: $SKILLS_DIR" >&2
    exit 2
fi

# ─── Frontmatter parser ──────────────────────────────────────────────────────
# Extracts a single field from YAML frontmatter (delimited by --- lines).
# Handles single-line scalars and inline arrays [a, b, c].
# Outputs raw value (trimmed) or empty if missing.

read_field() {
    local file="$1" field="$2"
    awk -v f="$field" '
        BEGIN { in_fm = 0; fm_count = 0; found = "" }
        /^---[[:space:]]*$/ {
            fm_count++
            if (fm_count == 1) { in_fm = 1; next }
            if (fm_count == 2) { in_fm = 0; exit }
        }
        in_fm && $0 ~ "^" f "[[:space:]]*:" {
            # strip "field:" prefix
            sub("^" f "[[:space:]]*:[[:space:]]*", "")
            found = $0
            exit
        }
        END { print found }
    ' "$file"
}

# Parse an inline-array value like "[a, b, c]" into space-separated tokens.
parse_array() {
    local val="$1"
    # strip [ ] and quotes, split on comma
    val="${val#[}"; val="${val%]}"
    echo "$val" | tr ',' '\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^["'\'']*//' -e 's/["'\'']*$//' | grep -v '^$' || true
}

# ─── Per-skill audit ─────────────────────────────────────────────────────────
# Sets these globals after each call (cheaper than encoding-decoding everywhere):
#   AUDIT_NAME, AUDIT_CATEGORY, AUDIT_TAGS (newline-sep), AUDIT_MATURITY,
#   AUDIT_EXTERNAL_DEPS (newline-sep), AUDIT_DESCRIPTION,
#   AUDIT_SIZE_BYTES, AUDIT_SUPPORT_DIRS (newline-sep),
#   AUDIT_HAS_INSTALL, AUDIT_EXTERNAL_PATHS (line\tlines, newline-sep),
#   AUDIT_PRIVATE (0|1),
#   AUDIT_ERRORS (newline-sep), AUDIT_WARNINGS (newline-sep)

audit_skill() {
    local skill_dir="$1"
    local name; name="$(basename "$skill_dir")"
    local skill_file="$skill_dir/SKILL.md"

    AUDIT_NAME="$name"
    AUDIT_CATEGORY=""
    AUDIT_TAGS=""
    AUDIT_MATURITY=""
    AUDIT_EXTERNAL_DEPS=""
    AUDIT_DESCRIPTION=""
    AUDIT_SIZE_BYTES=0
    AUDIT_SUPPORT_DIRS=""
    AUDIT_HAS_INSTALL=0
    AUDIT_EXTERNAL_PATHS=""
    AUDIT_PRIVATE=0
    AUDIT_ERRORS=""
    AUDIT_WARNINGS=""

    # SKILL.md must exist
    if [[ ! -f "$skill_file" ]]; then
        AUDIT_ERRORS="missing SKILL.md"
        return
    fi

    AUDIT_SIZE_BYTES=$(stat -c%s "$skill_file" 2>/dev/null || stat -f%z "$skill_file" 2>/dev/null || echo 0)

    # Required fields
    local fm_name fm_desc
    fm_name="$(read_field "$skill_file" name)"
    fm_desc="$(read_field "$skill_file" description)"

    if [[ -z "$fm_name" ]]; then
        AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}missing required field: name"
    elif [[ "$fm_name" != "$name" ]]; then
        AUDIT_WARNINGS="${AUDIT_WARNINGS:+$AUDIT_WARNINGS$'\n'}name field ('$fm_name') differs from directory name ('$name')"
    fi

    if [[ -z "$fm_desc" ]]; then
        AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}missing required field: description"
    fi
    AUDIT_DESCRIPTION="$fm_desc"

    # Description QUALITY — the description is the ONLY text the auto-selector sees,
    # so a placeholder, a leaked shell/path line, a name-restating "X Skill" title,
    # or a truncated fragment makes the skill effectively un-auto-selectable. These
    # are errors (the self-edit-gate only escalates on errors), so future garbage is
    # caught instead of silently shipping. Quote-tolerant; mirrors the patterns that
    # produced the 2026-06 description cleanup.
    if [[ -n "$fm_desc" ]]; then
        local dq name_norm desc_norm
        dq="${fm_desc#\"}"; dq="${dq%\"}"
        dq="$(printf '%s' "$dq" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        name_norm="$(printf '%s' "$name" | tr 'A-Z' 'a-z' | tr -d ' _-')"
        desc_norm="$(printf '%s' "$dq" | tr 'A-Z' 'a-z' | tr -d ' _-')"
        if printf '%s' "$dq" | grep -qiE '\[TODO'; then
            AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}description is an unfilled [TODO] placeholder"
        elif printf '%s' "$dq" | grep -qE '^(cd |SKILL_DIR|export |#!|\$\()'; then
            AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}description looks like a leaked shell/path line, not prose"
        elif printf '%s' "$dq" | grep -qiE '^skill:[[:space:]]' || printf '%s' "$dq" | grep -qiE '^[a-z0-9 ._&/-]+ skill$'; then
            AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}description is title-only (just restates the name) — state what it does + when to use it"
        elif [[ -n "$desc_norm" && "$name_norm" == "$desc_norm" ]]; then
            AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}description equals the skill name — state what it does + when to use it"
        elif printf '%s' "$dq" | grep -qE ':$'; then
            AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}description ends with ':' (truncated) — complete the sentence"
        fi
    fi

    # New optional fields
    AUDIT_CATEGORY="$(read_field "$skill_file" category)"
    AUDIT_MATURITY="$(read_field "$skill_file" maturity)"
    local tags_raw deps_raw private_raw
    tags_raw="$(read_field "$skill_file" tags)"
    deps_raw="$(read_field "$skill_file" external_deps)"
    private_raw="$(read_field "$skill_file" private)"

    # private: true means this skill is excluded from showcase repo sync.
    # Private skills are allowed to have hardcoded local paths since they
    # never ship publicly — we don't warn about external paths for them.
    if [[ "$private_raw" == "true" ]]; then
        AUDIT_PRIVATE=1
    fi

    if [[ -n "$tags_raw" ]]; then
        AUDIT_TAGS="$(parse_array "$tags_raw" | paste -sd '\n' -)"
    fi
    if [[ -n "$deps_raw" ]]; then
        AUDIT_EXTERNAL_DEPS="$(parse_array "$deps_raw" | paste -sd '\n' -)"
    fi

    # Validate category — REQUIRED (Phase 3+) and must be one of the controlled list.
    if [[ -z "$AUDIT_CATEGORY" ]]; then
        AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}missing required field: category"
    else
        local cat_valid=0
        for c in "${VALID_CATEGORIES[@]}"; do
            [[ "$AUDIT_CATEGORY" == "$c" ]] && cat_valid=1 && break
        done
        if [[ $cat_valid -eq 0 ]]; then
            AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}invalid category '$AUDIT_CATEGORY' — must be one of: ${VALID_CATEGORIES[*]}"
        fi
    fi

    # Validate maturity — REQUIRED (Phase 3+) and must be one of the controlled list.
    if [[ -z "$AUDIT_MATURITY" ]]; then
        AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}missing required field: maturity"
    else
        local valid=0
        for m in "${VALID_MATURITY[@]}"; do
            [[ "$AUDIT_MATURITY" == "$m" ]] && valid=1 && break
        done
        if [[ $valid -eq 0 ]]; then
            AUDIT_ERRORS="${AUDIT_ERRORS:+$AUDIT_ERRORS$'\n'}invalid maturity value '$AUDIT_MATURITY' — must be one of: ${VALID_MATURITY[*]}"
        fi
    fi

    # Size warning
    if [[ "$AUDIT_SIZE_BYTES" -gt "$SIZE_WARN_BYTES" ]]; then
        AUDIT_WARNINGS="${AUDIT_WARNINGS:+$AUDIT_WARNINGS$'\n'}SKILL.md is $(( AUDIT_SIZE_BYTES / 1024 )) KB (>5 KB) — consider splitting"
    fi

    # Support dirs
    local dirs_found=()
    for d in "${SUPPORT_DIRS[@]}"; do
        [[ -d "$skill_dir/$d" ]] && dirs_found+=("$d")
    done
    if [[ ${#dirs_found[@]} -gt 0 ]]; then
        AUDIT_SUPPORT_DIRS="$(printf '%s\n' "${dirs_found[@]}")"
    fi

    # INSTALL.md
    [[ -f "$skill_dir/INSTALL.md" ]] && AUDIT_HAS_INSTALL=1

    # External path references in SKILL.md body.
    # We flag anything that looks like a user-local path (~/projects/, ~/openclaw/, /home/<user>/).
    # We DO NOT flag:
    #   - paths containing < or > (template placeholders like ~/projects/<project>/PLAN.json)
    #   - paths inside ${...} expansions (already portable, e.g. ${TASK_QUEUE_HOME:-$HOME/projects/task-queue})
    local paths
    paths="$(grep -nE "$EXTERNAL_PATH_REGEX" "$skill_file" 2>/dev/null \
        | grep -vE '<[a-zA-Z_-]+>' \
        | grep -vE '\$\{[A-Z_]+:-' \
        | head -20 | sed 's/^/  /' || true)"
    AUDIT_EXTERNAL_PATHS="$paths"

    # If external paths exist or external_deps is set, require INSTALL.md.
    # Private skills are exempt — they're allowed to reference local-only paths
    # since they never sync to the public repo.
    if [[ "$AUDIT_PRIVATE" -eq 0 ]]; then
        if [[ -n "$AUDIT_EXTERNAL_PATHS" || -n "$AUDIT_EXTERNAL_DEPS" ]]; then
            if [[ "$AUDIT_HAS_INSTALL" -eq 0 ]]; then
                AUDIT_WARNINGS="${AUDIT_WARNINGS:+$AUDIT_WARNINGS$'\n'}references external paths or has external_deps but no INSTALL.md"
            fi
        fi
    else
        # Private skill — clear any external_path warnings; those are fine here.
        AUDIT_EXTERNAL_PATHS=""
    fi

    # category/maturity are validated above as REQUIRED fields (Phase 3+).

    # Always return 0 — a failing [[ -z ... ]] check at end of function must not propagate under set -e.
    return 0
}

# ─── Output: text ────────────────────────────────────────────────────────────

print_skill_text() {
    local has_problem=0
    [[ -n "$AUDIT_ERRORS" || -n "$AUDIT_WARNINGS" ]] && has_problem=1
    [[ $QUIET -eq 1 && $has_problem -eq 0 ]] && return

    local status="✅"
    [[ -n "$AUDIT_WARNINGS" ]] && status="⚠️ "
    [[ -n "$AUDIT_ERRORS" ]] && status="❌"
    local privacy_marker=""
    [[ "$AUDIT_PRIVATE" -eq 1 ]] && privacy_marker=" 🔒"

    local sz_kb
    sz_kb=$(awk "BEGIN { printf \"%.1f\", $AUDIT_SIZE_BYTES/1024 }")

    printf "%s  %-30s  category=%-20s  maturity=%-13s  size=%sKB%s\n" \
        "$status" "$AUDIT_NAME" "${AUDIT_CATEGORY:-—}" "${AUDIT_MATURITY:-—}" "$sz_kb" "$privacy_marker"

    if [[ -n "$AUDIT_TAGS" ]]; then
        printf "      tags: %s\n" "$(echo "$AUDIT_TAGS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
    fi
    if [[ -n "$AUDIT_SUPPORT_DIRS" ]]; then
        printf "      support: %s\n" "$(echo "$AUDIT_SUPPORT_DIRS" | tr '\n' ' ')"
    fi
    if [[ $AUDIT_HAS_INSTALL -eq 1 ]]; then
        printf "      INSTALL.md ✓\n"
    fi
    if [[ -n "$AUDIT_EXTERNAL_DEPS" ]]; then
        printf "      external_deps: %s\n" "$(echo "$AUDIT_EXTERNAL_DEPS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
    fi
    if [[ -n "$AUDIT_EXTERNAL_PATHS" ]]; then
        printf "      external paths in body:\n%s\n" "$AUDIT_EXTERNAL_PATHS"
    fi
    if [[ -n "$AUDIT_WARNINGS" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            printf "      ⚠️  %s\n" "$line"
        done <<< "$AUDIT_WARNINGS"
    fi
    if [[ -n "$AUDIT_ERRORS" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            printf "      ❌ %s\n" "$line"
        done <<< "$AUDIT_ERRORS"
    fi
}

# ─── Output: json ────────────────────────────────────────────────────────────
# Emits one JSON object per skill; main loop wraps them in an array.

json_string() {
    # Escape a value for JSON. Handles backslash, quote, control chars.
    python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().rstrip("\n")))' <<< "$1"
}

json_array_lines() {
    # Convert newline-separated lines to a JSON array of strings.
    if [[ -z "$1" ]]; then
        echo "[]"
    else
        printf '%s' "$1" | python3 -c '
import json,sys
lines = [l for l in sys.stdin.read().splitlines() if l.strip()]
print(json.dumps(lines))'
    fi
}

print_skill_json() {
    local has_problem=false
    [[ -n "$AUDIT_ERRORS" || -n "$AUDIT_WARNINGS" ]] && has_problem=true

    cat <<EOF
{
  "name": $(json_string "$AUDIT_NAME"),
  "category": $(json_string "$AUDIT_CATEGORY"),
  "maturity": $(json_string "$AUDIT_MATURITY"),
  "description": $(json_string "$AUDIT_DESCRIPTION"),
  "tags": $(json_array_lines "$AUDIT_TAGS"),
  "external_deps": $(json_array_lines "$AUDIT_EXTERNAL_DEPS"),
  "size_bytes": $AUDIT_SIZE_BYTES,
  "support_dirs": $(json_array_lines "$AUDIT_SUPPORT_DIRS"),
  "has_install_md": $([[ $AUDIT_HAS_INSTALL -eq 1 ]] && echo true || echo false),
  "external_path_refs": $(json_array_lines "$AUDIT_EXTERNAL_PATHS"),
  "private": $([[ $AUDIT_PRIVATE -eq 1 ]] && echo true || echo false),
  "errors": $(json_array_lines "$AUDIT_ERRORS"),
  "warnings": $(json_array_lines "$AUDIT_WARNINGS")
}
EOF
}

# ─── Main loop ───────────────────────────────────────────────────────────────

declare -i TOTAL=0 ERRORS=0 WARNINGS=0 CLEAN=0 PRIVATE_COUNT=0
declare -A CATEGORY_COUNT MATURITY_COUNT
EXTERNAL_PATH_COUNT=0
HAS_DEPS_NO_INSTALL_COUNT=0

main() {
    local skill_dirs=()
    if [[ -n "$SINGLE_SKILL" ]]; then
        if [[ ! -d "$SKILLS_DIR/$SINGLE_SKILL" ]]; then
            echo "Skill not found: $SINGLE_SKILL" >&2
            exit 2
        fi
        skill_dirs=("$SKILLS_DIR/$SINGLE_SKILL")
    else
        # Sorted, only directories
        while IFS= read -r -d '' d; do
            skill_dirs+=("$d")
        done < <(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
    fi

    if [[ "$MODE" == "json" ]]; then
        printf '['
        local first=1
        for skill_dir in "${skill_dirs[@]}"; do
            audit_skill "$skill_dir"
            [[ $first -eq 1 ]] && first=0 || printf ','
            printf '\n'
            print_skill_json
            tally
        done
        printf '\n]\n'
    else
        printf "\n🔍 Skill audit: %s\n" "$SKILLS_DIR"
        printf "%s\n\n" "$(printf '%.0s─' {1..78})"
        for skill_dir in "${skill_dirs[@]}"; do
            audit_skill "$skill_dir"
            print_skill_text
            tally
        done
        print_summary_text
    fi

    # Exit non-zero if any errors
    [[ $ERRORS -gt 0 ]] && exit 1
    exit 0
}

tally() {
    TOTAL=$((TOTAL+1))
    if [[ -n "$AUDIT_ERRORS" ]]; then
        ERRORS=$((ERRORS+1))
    elif [[ -n "$AUDIT_WARNINGS" ]]; then
        WARNINGS=$((WARNINGS+1))
    else
        CLEAN=$((CLEAN+1))
    fi
    if [[ -n "$AUDIT_CATEGORY" ]]; then
        CATEGORY_COUNT["$AUDIT_CATEGORY"]=$((${CATEGORY_COUNT["$AUDIT_CATEGORY"]:-0}+1))
    else
        CATEGORY_COUNT["(uncategorized)"]=$((${CATEGORY_COUNT["(uncategorized)"]:-0}+1))
    fi
    if [[ -n "$AUDIT_MATURITY" ]]; then
        MATURITY_COUNT["$AUDIT_MATURITY"]=$((${MATURITY_COUNT["$AUDIT_MATURITY"]:-0}+1))
    else
        MATURITY_COUNT["(unset)"]=$((${MATURITY_COUNT["(unset)"]:-0}+1))
    fi
    [[ -n "$AUDIT_EXTERNAL_PATHS" ]] && EXTERNAL_PATH_COUNT=$((EXTERNAL_PATH_COUNT+1))
    if [[ ( -n "$AUDIT_EXTERNAL_PATHS" || -n "$AUDIT_EXTERNAL_DEPS" ) && $AUDIT_HAS_INSTALL -eq 0 && $AUDIT_PRIVATE -eq 0 ]]; then
        HAS_DEPS_NO_INSTALL_COUNT=$((HAS_DEPS_NO_INSTALL_COUNT+1))
    fi
    [[ $AUDIT_PRIVATE -eq 1 ]] && PRIVATE_COUNT=$((PRIVATE_COUNT+1))
    return 0
}

print_summary_text() {
    printf "\n%s\n" "$(printf '%.0s─' {1..78})"
    printf "Summary: %d skills audited\n" "$TOTAL"
    printf "  ✅ clean:    %d\n" "$CLEAN"
    printf "  ⚠️  warnings: %d\n" "$WARNINGS"
    printf "  ❌ errors:   %d\n" "$ERRORS"
    printf "\nBy category:\n"
    for cat in "${!CATEGORY_COUNT[@]}"; do
        printf "  %4d  %s\n" "${CATEGORY_COUNT[$cat]}" "$cat"
    done | sort -rn
    printf "\nBy maturity:\n"
    for m in "${!MATURITY_COUNT[@]}"; do
        printf "  %4d  %s\n" "${MATURITY_COUNT[$m]}" "$m"
    done | sort -rn
    printf "\nMigration backlog:\n"
    printf "  %4d  skills reference external paths in SKILL.md body\n" "$EXTERNAL_PATH_COUNT"
    printf "  %4d  skills have external deps but no INSTALL.md\n" "$HAS_DEPS_NO_INSTALL_COUNT"
    printf "\nPrivacy:\n"
    printf "  %4d  🔒 private skills (excluded from showcase repo sync)\n" "$PRIVATE_COUNT"
    printf "\n"
}

main
