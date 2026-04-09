---
name: a11y-audit
description: "Accessibility auditing: WCAG compliance checking, contrast ratios, ARIA labels, keyboard navigation, semantic HTML, screen reader compatibility."
---

# a11y-audit

Accessibility auditing: WCAG compliance checking, contrast ratios, ARIA labels, keyboard navigation, semantic HTML, screen reader compatibility.

## Use When

- Auditing web pages for accessibility compliance
- Checking color contrast ratios against WCAG standards
- Verifying ARIA attributes and landmark usage
- Ensuring keyboard navigability
- Meeting WCAG 2.1 AA standards
- Reviewing HTML for semantic correctness and screen reader compatibility

## Scripts

### contrast-checker.py

Calculates WCAG contrast ratios between foreground and background colors. Pure Python, no dependencies.

**Single pair:**

```bash
python3 scripts/contrast-checker.py --fg "#333333" --bg "#ffffff"
```

**Batch mode** (reads JSON file with array of `{"fg": "#hex", "bg": "#hex", "label": "optional"}` objects):

```bash
python3 scripts/contrast-checker.py --batch colors.json
```

Output includes:

- Contrast ratio (e.g., 12.63:1)
- Pass/fail for AA normal text (≥4.5:1), AA large text (≥3:1)
- Pass/fail for AAA normal text (≥7:1), AAA large text (≥4.5:1)

### html-a11y-scan.py

Scans an HTML file for common accessibility issues. Uses Python's built-in `html.parser`.

```bash
python3 scripts/html-a11y-scan.py page.html
python3 scripts/html-a11y-scan.py page.html --format json
python3 scripts/html-a11y-scan.py page.html --format text
```

Checks for:

- Images without `alt` attributes (critical)
- Form inputs without labels or `aria-label` (critical)
- Missing `lang` attribute on `<html>` (critical)
- Empty links or buttons (warning)
- Skipped heading levels (warning)
- Tables without `<th>` headers (warning)
- Missing ARIA landmarks: `main`, `nav`, `banner`, `contentinfo` (info)

Output (JSON by default): array of issues with `severity`, `element`, `line`, `issue`, and `suggestion` fields.

### keyboard-nav-checklist.sh

Generates a Markdown checklist for manual keyboard navigation testing.

```bash
bash scripts/keyboard-nav-checklist.sh
bash scripts/keyboard-nav-checklist.sh --output checklist.md
```

Covers: focus management, tab order, focus indicators, modal behavior, keyboard traps, skip links, and more.

## References

- **wcag-quickref.md** — WCAG 2.1 AA requirements organized by principle (Perceivable, Operable, Understandable, Robust)
- **aria-patterns.md** — Common ARIA patterns with correct role/state/property usage for tabs, modals, accordions, menus, comboboxes

## Examples

### Quick contrast check

```bash
python3 scripts/contrast-checker.py --fg "#767676" --bg "#ffffff"
# Ratio: 4.54:1 — AA normal: PASS, AA large: PASS, AAA normal: FAIL, AAA large: PASS
```

### Full page audit

```bash
python3 scripts/html-a11y-scan.py mypage.html --format text
```

### Batch color audit for a design system

```json
[
  { "fg": "#333333", "bg": "#ffffff", "label": "body text" },
  { "fg": "#767676", "bg": "#ffffff", "label": "muted text" },
  { "fg": "#ffffff", "bg": "#0066cc", "label": "button text" }
]
```

```bash
python3 scripts/contrast-checker.py --batch design-colors.json
```

## Dependencies

- Python 3.6+ (standard library only)
- Bash (for keyboard checklist)
