---
name: frontend-inspector
description: "Analyze frontend screenshots using vision model analysis and automated checks: detect layout bugs, alignment issues, overflow, z-index problems, spacing inconsistencies, color contrast issues."
---

# frontend-inspector

Analyze frontend screenshots using vision model analysis and automated checks: detect layout bugs, alignment issues, overflow, z-index problems, spacing inconsistencies, color contrast issues.

## When to Use

- Reviewing UI implementations before presenting to stakeholders
- Checking visual quality of built pages
- Finding CSS bugs from screenshots or source code
- Self-reviewing frontend work before presenting to the user
- Auditing CSS codebases for common anti-patterns

## Scripts

### analyze-screenshot.sh

Generates a structured vision-model analysis prompt and checklist for a screenshot.

```bash
bash scripts/analyze-screenshot.sh screenshot.png
```

**Output:** A Markdown document with:

- The image path for vision model input
- Structured analysis categories (Layout, Typography, Color, Components, Responsiveness)
- A checklist template to fill in during review

Use the output as a prompt when analyzing the screenshot with a vision model.

### css-issue-detector.py

Static analysis of HTML/CSS files for common issues.

```bash
python3 scripts/css-issue-detector.py --input page.html --output report.json
```

**Arguments:**

- `--input` — HTML file to analyze (required)
- `--output` — JSON report output path (default: stdout)

**Detects:**

- `!important` overuse (>10 occurrences = warning)
- Deeply nested selectors (>4 levels)
- Magic numbers (hardcoded px values that could be variables)
- Missing responsive breakpoints (no media queries)
- z-index wars (z-index > 100)

**Output:** JSON report with issues grouped by category, each with severity (info/warning/error).

### layout-checklist.sh

Generates a page-type-specific review checklist.

```bash
bash scripts/layout-checklist.sh --type dashboard
```

**Supported types:** `dashboard`, `form`, `landing`, `table`, `card-grid`

**Output:** Markdown checklist with type-specific items to verify.

## References

- `references/common-visual-bugs.md` — 30+ common frontend visual bugs catalog
- `references/vision-prompt-templates.md` — Ready-to-use prompts for vision model screenshot analysis

## Dependencies

- Python 3 (for css-issue-detector.py)
- Bash (for shell scripts)
