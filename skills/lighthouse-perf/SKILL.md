---
name: lighthouse-perf
description: "Run performance audits on web pages: Lighthouse scores, Core Web Vitals, resource analysis, bundle size tracking, performance budgets."
---

# lighthouse-perf

Run performance audits on web pages: Lighthouse scores, Core Web Vitals, resource analysis, bundle size tracking, performance budgets.

## Use When

- Measuring page load performance
- Tracking Core Web Vitals (LCP, FID/INP, CLS)
- Analyzing resource sizes and page weight
- Setting and enforcing performance budgets
- Optimizing frontend performance

## Scripts

### lighthouse-run.sh

Bash wrapper that runs Lighthouse or falls back to curl-based metrics.

```bash
bash scripts/lighthouse-run.sh --url https://example.com --output ./results --format json
bash scripts/lighthouse-run.sh --url https://example.com --format html
```

**Strategy:**

1. If `lighthouse` CLI is available → use it directly
2. Fallback → `curl` for basic metrics (TTFB, total size, HTTP status, timing)

Captures: performance score, FCP, LCP, CLS, TBT, Speed Index (Lighthouse mode) or TTFB, total time, size (curl mode).

If Lighthouse is not installed, suggests: `npm install -g lighthouse`

### resource-analyzer.sh

Fetches a page and analyzes all linked resources.

```bash
bash scripts/resource-analyzer.sh https://example.com
bash scripts/resource-analyzer.sh https://example.com --output report.md
```

Reports:

- Total page weight and resource count by type (CSS, JS, images, fonts, other)
- Markdown table of all resources sorted by size
- Flags: images >500KB, JS >250KB, uncompressed resources

### perf-budget.py

Performance budget tracker with history.

```bash
# Check against budget
python3 scripts/perf-budget.py --budget budget.json --actual measurements.json

# With history tracking
python3 scripts/perf-budget.py --budget budget.json --actual measurements.json --history history.jsonl
```

**Budget format** (`budget.json`):

```json
{
  "js_total_kb": 300,
  "css_total_kb": 100,
  "image_total_kb": 500,
  "total_kb": 1500,
  "lcp_ms": 2500,
  "cls": 0.1,
  "fcp_ms": 1800
}
```

**Measurements format** (`measurements.json`):

```json
{
  "js_total_kb": 280,
  "css_total_kb": 85,
  "image_total_kb": 420,
  "total_kb": 1200,
  "lcp_ms": 2100,
  "cls": 0.05,
  "fcp_ms": 1500
}
```

Output: pass/fail per metric with delta from budget. Appends to JSONL history file for trend tracking.

## References

- **core-web-vitals.md** — LCP, FID, CLS, INP explained with good/bad thresholds and common fixes
- **optimization-checklist.md** — Performance optimization checklist for images, JS, CSS, fonts, caching

## Dependencies

- Bash, curl (required)
- Node.js + Lighthouse CLI (optional, for full audits)
- Python 3.6+ (for perf-budget.py, standard library only)
