---
name: design-critic
user-invocable: false
description: Autonomous UI/UX review — screenshots every page at mobile/tablet/desktop (full-page scrolling), analyzes with vision models for layout bugs, checks accessibility (axe-core), audits contrast/colors/fonts/spacing for design system inconsistencies, detects dead buttons/links, overlapping elements hiding text/buttons, text truncation, broken links, and runs Lighthouse performance audits. Produces a prioritized report with severity scores and actionable fixes. Use before any launch, after major UI changes, or when the user asks to check/review a web app.
triggers:
  - review the UI
  - check the frontend
  - design review
  - accessibility audit
  - is the app ready
  - visual bugs
  - check for issues
  - responsive check
  - lighthouse
  - a11y audit
  - design critic
  - review the site
  - check the website
---

# Design Critic

Autonomous UI/UX reviewer. Point it at any running web app → get a prioritized list of every visual, responsive, accessibility, and functionality issue with actionable fixes.

**Scripts:** `~/openclaw/skills/design-critic/scripts/`
**Reviews:** `~/.design-critic/reviews/`
**Binary:** `~/bin/design-critic`

## Quick Reference

```bash
S=~/openclaw/skills/design-critic/scripts

# Full review (the default workflow)
design-critic http://localhost:5173

# Quick check (mobile + desktop, no lighthouse)
design-critic http://localhost:5173 --quick

# Full audit (all 9 viewports, lighthouse, dark mode, discovery, vision prompts)
design-critic http://localhost:5173 --full

# Responsive focus (all viewport sizes, no lighthouse)
design-critic http://localhost:5173 --responsive

# After fixes — compare with previous review
design-critic http://localhost:5173 --compare ~/.design-critic/reviews/PREVIOUS_DIR
```

---

## The Autonomous Review Workflow

**This is the workflow to use before telling Aksel anything is "done":**

### Step 1: Run the review
```bash
design-critic http://localhost:5173 --full
```

### Step 2: Read the report
```bash
cat ~/.design-critic/reviews/LATEST/report.md
```

### Step 3: AI visual review of screenshots
```bash
# Use the image tool on captured screenshots with generated vision prompts
cat CAPTURE_DIR/vision-prompts.json | jq '.[0]'
# Then use image tool: analyze the screenshot with the vision prompt
```

### Step 4: Fix all critical + high issues

### Step 5: Re-run and compare
```bash
design-critic http://localhost:5173 --compare ~/.design-critic/reviews/PREVIOUS_DIR
```

### Step 6: Only report "done" when score ≥ 80 and 0 critical issues

---

## What It Detects

### 📱 Responsive / Layout
- **Horizontal overflow** — elements extending beyond viewport (causes horizontal scrolling)
- **Content hidden on mobile** — scroll height dramatically shorter than desktop
- **Buttons/links disappearing** at smaller viewports
- **Broken grids** — misaligned columns, uneven gutters

### 👁️ Visual / Text
- **Text truncation** — content cut off by overflow:hidden without tooltip/expand
- **Overlapping elements** — interactive elements (buttons, links, inputs) hidden behind other elements (sticky headers, modals, z-index issues)
- **Contrast failures** — WCAG AA (4.5:1 normal, 3:1 large text) with exact ratios
- **Text partially hidden** — labels/text clipped by container boundaries

### ♿ Accessibility (axe-core)
- WCAG 2.0 A, AA + 2.1 A, AA + best practices
- Missing alt text on images
- Unlabeled form inputs
- Skipped heading levels (h1 → h3)
- Multiple h1 tags
- Missing landmarks (<main>, <nav>)
- Color contrast violations

### ⚙️ Functionality
- **Dead buttons** — no click handler, no href, not in a form
- **Placeholder links** — href="#", empty href, javascript:void(0)
- **Broken links** — 404s, 5xx server errors, timeouts
- **Non-functional interactive elements**

### 🎨 Design System Consistency
- **Font families** — flags >4 different families
- **Font sizes** — flags >10 unique sizes (no type scale)
- **Color palette** — flags >12 unique colors (inconsistent theming)
- **Spacing** — flags >8 unique margin values (no spacing scale)

### ⚡ Performance (Lighthouse)
- Core Web Vitals (FCP, LCP, TBT, CLS, SI, TTI)
- Performance, Accessibility, Best Practices, SEO scores
- Top opportunities with estimated savings
- Diagnostics

---

## Scripts

### `review.cjs` — Full Orchestrator (use this)
```bash
node review.cjs <url> [options]

Presets:
  --quick             Mobile + desktop, skip lighthouse (~15s)
  --full              All 9 viewports, lighthouse, dark mode, discovery (~2-3min)
  --responsive        All viewport sizes, skip lighthouse (~30s)

Options:
  --viewports LIST    Comma-separated: mobile-sm,mobile,mobile-lg,tablet,tablet-lg,desktop,desktop-lg,wide,ultrawide
  --discover          Auto-discover linked pages (follows same-origin links)
  --max-pages N       Max pages to discover (default: 10)
  --no-lighthouse     Skip lighthouse audit
  --dark-mode         Also capture in dark mode
  --compare DIR       Compare with previous review (shows fixed/new/remaining)
  --output-dir DIR    Override output directory
  --vision            Generate vision analysis prompts for AI screenshot review
```

### `capture.cjs` — Multi-Viewport Capture
```bash
node capture.cjs <url> [options]

  --output-dir DIR    Output directory
  --viewports LIST    Viewport names (see list below)
  --delay MS          Wait after page load (default: 2000)
  --discover          Auto-discover pages
  --max-pages N       Max pages (default: 10)
  --dark-mode         Dark mode capture
  --scroll-step PX    Scroll step for section captures (default: 800)
  --no-links          Skip link checking
  --cookies FILE      JSON cookie file for authenticated sites
```

Captures per viewport:
1. **Full-page screenshot** — entire scrollable page stitched
2. **Above-the-fold screenshot** — what users see first
3. **Section screenshots** — every scrolled section (catches lazy-loaded content)

### `analyze.cjs` — Issue Analysis
```bash
node analyze.cjs <capture-dir> [options]

  --format md|json    Output format (default: md)
  --vision            Generate vision prompts for AI review
  --output FILE       Write report to file
```

### `lighthouse.cjs` — Performance Audit
```bash
node lighthouse.cjs <url> [options]

  --output-dir DIR    Output directory
  --categories LIST   performance,accessibility,best-practices,seo
```

---

## Available Viewports

| Name | Resolution | Device |
|------|-----------|--------|
| `mobile-sm` | 320×568 | iPhone SE |
| `mobile` | 375×812 | iPhone 14 |
| `mobile-lg` | 428×926 | iPhone 14 Pro Max |
| `tablet` | 768×1024 | iPad |
| `tablet-lg` | 1024×1366 | iPad Pro |
| `desktop` | 1280×800 | Laptop |
| `desktop-lg` | 1440×900 | Desktop 1440p |
| `wide` | 1920×1080 | Full HD |
| `ultrawide` | 2560×1440 | 2K Ultra-Wide |

---

## Severity Levels

| Level | Score | Meaning |
|-------|-------|---------|
| 🔴 Critical (10) | Ship-blocker | Invisible text, broken layout, inaccessible elements |
| 🟠 High (7) | Must fix | Contrast failures, dead buttons, broken links, missing alt text |
| 🟡 Medium (4) | Should fix | Text truncation, minor overflow, heading structure |
| 🔵 Low (2) | Nice to have | Design system inconsistencies, too many fonts |
| ⚪ Info (1) | FYI | Informational findings |

**Quality Score:** 100 minus sum of issue scores. Ship when ≥80 with 0 critical.

---

## Comparison Mode

Track progress across fix iterations:

```bash
# First review
design-critic http://localhost:5173 --output-dir ~/.design-critic/reviews/v1

# After fixes
design-critic http://localhost:5173 --compare ~/.design-critic/reviews/v1

# Output shows:
#   ✅ Fixed: 5 issues
#   🆕 New: 1 issue (regression)
#   ⏳ Remaining: 3 issues
```

---

## Vision-Powered Review

The `--vision` flag generates prompts optimized for the `image` tool:

```bash
# Generate prompts during capture
design-critic http://localhost:5173 --vision

# Then use the image tool with each screenshot + prompt
# The prompts check for:
#   - Layout misalignment, broken grids
#   - Visual hierarchy, CTA prominence
#   - Typography readability
#   - Color harmony
#   - Whitespace balance
#   - Component quality (broken cards, uneven borders)
#   - Text visibility (partially hidden, overlapped)
#   - Image issues (stretched, pixelated, missing)
#   - Navigation clarity
#   - Professional polish rating /10
```

---

## Cookie Auth for Protected Pages

```bash
# Export cookies as JSON array
echo '[{"name":"session","value":"abc123","domain":"localhost","path":"/"}]' > /tmp/cookies.json

design-critic http://localhost:5173 --cookies /tmp/cookies.json
```

---

## Auto-Discovery

Follows same-origin links to find all pages:

```bash
design-critic http://localhost:5173 --discover --max-pages 20
```

Discovers: navigation links, footer links, breadcrumbs, sitemap links. Ignores: external links, file downloads, anchor fragments.

---

## Dependencies

- **chromium-browser** (145.0) — headless screenshots
- **playwright-core** (1.58.2) — browser automation
- **axe-core** (local) — accessibility engine
- **lighthouse** (13.0.3) — performance audit
- **Node.js** (22.x)

---

## Output Structure

```
~/.design-critic/reviews/<site>_<timestamp>/
├── light/                    # Light mode captures
│   ├── index/                # Per-page directory
│   │   ├── mobile-full.png
│   │   ├── mobile-fold.png
│   │   ├── mobile-section-0.png
│   │   ├── mobile-section-1.png
│   │   ├── desktop-full.png
│   │   ├── desktop-fold.png
│   │   └── ...
│   ├── capture-results.json
│   ├── issues.json
│   └── vision-prompts.json
├── dark/                     # Dark mode captures (if --dark-mode)
├── lighthouse/               # Lighthouse reports
│   ├── *.json
│   └── *.html
├── report.md                 # Human-readable report
├── report.json               # Machine-readable report
└── comparison.json           # If --compare was used
```
