---
name: flow-tester
user-invocable: false
description: End-to-end user journey tester using Playwright. Tests multi-step flows (signup, checkout, CRUD) with screenshots at each step. Auto-generates flows from URLs or text descriptions. Use after integration work to verify complete user journeys work.
triggers:
  - test user flow
  - e2e test
  - flow test
  - user journey
  - integration test
---

# flow-tester — End-to-End User Journey Tester

Playwright-based tool for testing multi-step user flows. Tests that complete user journeys work, not just individual pages.

## Quick Start

```bash
# Run a flow definition
flow-tester run flow.json

# Auto-generate and run a flow from a URL
flow-tester review https://example.com --generate

# Generate flow from text description
flow-tester gen --describe "login with email test@test.com password 123, click Dashboard"

# Generate flow from URL (inspect page, find forms/links)
flow-tester gen https://myapp.com --output flow.json

# Generate report from results
flow-tester report ~/.flow-tester/results/<timestamp>/
```

## Flow Definition Format

```json
{
  "name": "User Registration Flow",
  "baseUrl": "http://localhost:5173",
  "timeout": 30000,
  "steps": [
    { "name": "Navigate to signup", "action": "goto", "url": "/signup" },
    { "name": "Fill email", "action": "fill", "selector": "input[name=email]", "value": "test@example.com" },
    { "name": "Click submit", "action": "click", "selector": "button[type=submit]" },
    { "name": "Verify redirect", "action": "assert", "type": "url-contains", "value": "/dashboard" },
    { "name": "Check welcome", "action": "assert", "type": "text-visible", "value": "Welcome" }
  ]
}
```

## Supported Actions

| Action | Key Properties | Description |
|--------|---------------|-------------|
| `goto` | `url` | Navigate (relative to baseUrl or absolute) |
| `click` | `selector` | Click element |
| `fill` | `selector`, `value` | Clear + type into input |
| `type` | `selector`, `value`, `delay?` | Type char-by-char (autocomplete) |
| `select` | `selector`, `value` | Select dropdown option |
| `hover` | `selector` | Hover over element |
| `scroll` | `selector` or `x`,`y` | Scroll to element/position |
| `wait` | `type`, `value`/`selector` | Wait for condition (selector/url/text/network-idle/time) |
| `screenshot` | `filename?`, `fullPage?` | Capture screenshot |
| `keyboard` | `key` | Press key (Enter, Tab, Escape, etc.) |
| `evaluate` | `expression`, `expected?` | Run JS in page context |
| `upload` | `selector`, `file`/`files` | Upload file(s) |
| `cookie` | `operation` (set/get/clear) | Manage cookies |
| `localStorage` | `operation`, `key?`, `value?` | Manage localStorage |

## Assert Types

| Type | Properties | Description |
|------|-----------|-------------|
| `url-contains` | `value` | URL includes string |
| `url-equals` | `value` | URL exact match |
| `text-visible` | `value` | Text appears on page |
| `text-not-visible` | `value` | Text not on page |
| `element-visible` | `selector` | Element is visible |
| `element-not-visible` | `selector` | Element not visible |
| `element-count` | `selector`, `expected` | Count of matching elements |
| `attribute-equals` | `selector`, `attribute`, `value` | Element attribute check |
| `value-equals` | `selector`, `value` | Input value check |
| `title-contains` | `value` | Page title includes string |
| `response-status` | `value` | Last navigation HTTP status |

## Options

- `--viewport mobile|desktop` — Viewport size
- `--headed` — Show browser (debugging)
- `--slowmo MS` — Slow down actions
- `--output-dir DIR` — Output directory
- `--compare DIR` — Compare with previous results
- `--retry N` — Retry failed steps

## Step Features

- Before/after screenshots for every step
- Timing recorded per step
- On failure: screenshot + console errors + HTML snapshot
- `"continueOnFailure": true` per step to keep going

## Output

Results go to `~/.flow-tester/results/<timestamp>/`:
- `results.json` — Machine-readable results
- `report.html` — HTML report with inline screenshots
- `report.md` — Markdown report
- `screenshots/` — All captured screenshots

## Scripts

- `scripts/flow-runner.cjs` — Core execution engine
- `scripts/flow-gen.cjs` — Flow generator (URL or description)
- `scripts/report.cjs` — Report generator (HTML/MD/comparison)
- `scripts/review.cjs` — Orchestrator (generate + run + report)

## Dependencies

- `playwright-core` (from ~/openclaw/node_modules/)
- Chromium at `/usr/bin/chromium-browser`
