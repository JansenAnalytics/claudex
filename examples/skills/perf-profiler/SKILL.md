---
name: perf-profiler
user-invocable: false
description: Runtime performance analysis beyond Lighthouse — bundle size analysis, memory leak detection, HTTP load testing, resource optimization audit, and runtime CPU profiling. Use before launch or when investigating performance issues.
triggers:
  - performance check
  - bundle size
  - memory leak
  - load test
  - perf profile
---

# perf-profiler — Runtime Performance Analysis

Performance profiling beyond Lighthouse: bundle analysis, memory leak detection, load testing, resource analysis, and runtime CPU profiling.

## Quick Start

```bash
perf-profiler bundle ./dist                    # Bundle size analysis
perf-profiler resources https://example.com    # Resource loading analysis
perf-profiler loadtest https://api.example.com --concurrency 20 --duration 30
perf-profiler memory https://app.example.com --iterations 10
perf-profiler runtime https://app.example.com --duration 10 --interaction scroll
perf-profiler review https://app.example.com --build-dir ./dist --full
```

## Scripts

### bundle.cjs — Bundle Size Analyzer
Analyzes JS/CSS files in build output. Reports per-file + gzipped sizes, detects heavy packages (moment→dayjs, lodash→lodash-es), parses source maps for package-level treemap.

```bash
node ~/openclaw/skills/perf-profiler/scripts/bundle.cjs <build-dir> [--source-maps]
```

Output: `bundle-analysis.json`

### memory.cjs — Memory Leak Detector
Uses Playwright to navigate a page repeatedly, measuring heap size after each iteration. Linear regression detects consistent growth.

```bash
node ~/openclaw/skills/perf-profiler/scripts/memory.cjs <url> [--iterations 10] [--actions flow.json]
```

Custom actions JSON format:
```json
[{"action":"click","selector":"button.open"},{"action":"wait","ms":500},{"action":"click","selector":"button.close"}]
```

### loadtest.cjs — HTTP Load Tester
Zero-dependency concurrent load tester. Measures p50/p95/p99 latency, req/s, error rate.

```bash
node ~/openclaw/skills/perf-profiler/scripts/loadtest.cjs <url> \
  [--concurrency 10] [--duration 30] [--requests 1000] [--ramp] \
  [--method POST] [--body '{"key":"val"}'] [--header "Content-Type: application/json"]
```

### resources.cjs — Resource Analysis
Monitors all network requests via CDP. Finds render-blocking resources, oversized images, unused CSS, uncompressed assets, third-party audit.

```bash
node ~/openclaw/skills/perf-profiler/scripts/resources.cjs <url> [--viewport mobile|desktop]
```

### runtime.cjs — Runtime Performance Profiling
CDP-based CPU profiling, long task detection, layout thrashing, frame rate monitoring.

```bash
node ~/openclaw/skills/perf-profiler/scripts/runtime.cjs <url> [--duration 10] [--interaction scroll|click|idle]
```

### review.cjs — Full Audit Orchestrator
Runs multiple tools and generates a combined scored report.

```bash
node ~/openclaw/skills/perf-profiler/scripts/review.cjs <url> \
  [--build-dir DIR] [--quick|--full] \
  [--load-concurrency N] [--load-duration S] [--memory-iterations N] \
  [--output-dir DIR] [--compare DIR]
```

### report.cjs — Report Generator
Combines individual analysis JSON files into a scored Markdown + JSON report.

```bash
node ~/openclaw/skills/perf-profiler/scripts/report.cjs [--input-dir DIR] [--output-dir DIR] [--compare DIR]
```

## Dependencies
- playwright-core (~/openclaw/node_modules/)
- Chromium (/usr/bin/chromium-browser)
- Node.js built-ins only (no npm install needed)

## Output
All scripts write JSON results to CWD. The report generator combines them into `perf-report.json` + `perf-report.md` with a 0-100 score.
