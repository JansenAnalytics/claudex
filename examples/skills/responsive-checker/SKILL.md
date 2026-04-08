---
name: responsive-checker
description: "Test responsive design across viewport sizes: capture screenshots at mobile/tablet/desktop breakpoints, detect overflow issues, flag breakpoint problems."
---

# responsive-checker

Test responsive design across viewport sizes: capture screenshots at mobile/tablet/desktop breakpoints, detect overflow issues, flag breakpoint problems.

## When to Use

- Verifying responsive layouts after CSS changes
- Testing mobile views of new pages
- Checking that components adapt properly across breakpoints
- Auditing responsive CSS for gaps or inconsistencies
- Detecting overflow issues at specific viewport sizes

## Scripts

### responsive-capture.py

Captures screenshots at multiple viewport sizes using Chromium.

```bash
python3 scripts/responsive-capture.py \
  --url https://example.com \
  --output-dir ./captures
```

Or with a local HTML file:

```bash
python3 scripts/responsive-capture.py \
  --url file:///path/to/page.html \
  --output-dir ./captures \
  --sizes "375x667,768x1024,1440x900"
```

**Arguments:**

- `--url` — URL or file:// path to capture (required)
- `--output-dir` — Directory for output screenshots (default: `./responsive-captures`)
- `--sizes` — Comma-separated viewport sizes (default: `375x667,768x1024,1440x900,1920x1080`)
- `--delay` — Seconds to wait after page load before capture (default: 2)

**Default breakpoints:**

- Mobile: 375×667
- Tablet: 768×1024
- Desktop: 1440×900
- Wide: 1920×1080

### overflow-detector.py

Detects responsive issues by injecting JavaScript checks at various viewport sizes.

```bash
python3 scripts/overflow-detector.py \
  --url https://example.com \
  --output report.json
```

**Arguments:**

- `--url` — URL to analyze (required)
- `--output` — JSON report path (default: stdout)
- `--sizes` — Viewport sizes to check (default: `375x667,768x1024,1440x900`)

**Detects:**

- Horizontal overflow (elements wider than viewport)
- Text truncation without ellipsis
- Non-responsive images (fixed width > viewport)
- Touch targets too small (<44px on mobile sizes)

### breakpoint-analyzer.sh

Static analysis of CSS files for media query patterns.

```bash
bash scripts/breakpoint-analyzer.sh style.css [additional.css ...]
```

**Output:**

- All media query breakpoints found
- Breakpoint coverage gaps
- Inconsistent breakpoint values across files
- Suggestions for standard breakpoints

## References

- `references/breakpoint-patterns.md` — Standard breakpoints, mobile-first vs desktop-first patterns

## Dependencies

- Python 3
- Chromium (`/usr/bin/chromium-browser`) for capture and overflow detection
