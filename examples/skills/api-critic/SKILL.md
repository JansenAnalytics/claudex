---
name: api-critic
user-invocable: false
description: Autonomous API testing and evaluation. Tests any REST API for correctness, security, performance, error handling, and standards compliance. Discovers endpoints, probes with valid/invalid/edge-case payloads, checks auth, response times, injection vulnerabilities, and generates severity-scored reports with actionable fixes. Use before any API "done" claim.
triggers:
  - test API
  - check API
  - api review
  - api critic
  - backend test
---

# api-critic — Autonomous API Testing & Evaluation

Like design-critic but for backends. Tests any REST API for correctness, security, performance, error handling, and standards compliance.

## Quick Start

```bash
api-critic https://jsonplaceholder.typicode.com
api-critic http://localhost:3000 --auth "Bearer token" --full
api-critic http://localhost:3000 --quick
api-critic http://localhost:3000 --compare /tmp/api-critic-previous
```

## Options

| Flag | Description |
|------|-------------|
| `--endpoints FILE` | Manual route list (JSON: `[{method, path, body?}]`) |
| `--auth "Bearer x"` | Authorization header for all requests |
| `--timeout MS` | Request timeout (default: 10000) |
| `--quick` | Skip edge cases (SQL injection, XSS, oversized payload) |
| `--full` | Run everything including extended probes |
| `--compare DIR` | Compare with previous run's output directory |
| `--out-dir DIR` | Output directory (default: /tmp/api-critic-TIMESTAMP) |

## What It Tests

### Correctness
- Happy path (valid requests → 2xx)
- JSON validity, schema types
- Status code correctness (201 for POST, 204 for DELETE)

### Security
- CORS wildcard detection
- Auth bypass (requests without auth header)
- Malformed token acceptance
- SQL injection strings in query params
- XSS reflection in responses
- Mass assignment (extra unknown fields accepted)

### Performance
- Response time (>500ms warning, >2000ms critical)

### Error Handling
- Empty body, null values → should get 4xx not 5xx
- Wrong Content-Type handling
- Oversized payload (1MB)

### Standards
- Content-Type headers present
- Cache headers on GET responses
- 405 for wrong HTTP methods
- Pagination support detection

## Pipeline

1. **discover.cjs** — Finds endpoints (OpenAPI spec, common paths, CRUD inference)
2. **probe.cjs** — Runs all tests against each endpoint
3. **report.cjs** — Generates scored report (0-100, grade A-F)

## Output

- `discovered-endpoints.json` — Found endpoints
- `probe-results.json` — Raw test results
- `api-critic-report.md` — Human-readable report
- `api-critic-report.json` — Machine-readable summary

## Individual Scripts

```bash
# Just discover
node ~/openclaw/skills/api-critic/scripts/discover.cjs https://api.example.com --out-dir /tmp/out

# Just probe (needs discovered-endpoints.json)
node ~/openclaw/skills/api-critic/scripts/probe.cjs https://api.example.com --out-dir /tmp/out

# Just report (needs probe-results.json)
node ~/openclaw/skills/api-critic/scripts/report.cjs --out-dir /tmp/out
```

## Dependencies

None. Uses only Node.js built-in modules (http, https, fs, path, url, child_process).
