---
name: security-auditor
user-invocable: false
description: Automated security testing — HTTP header audit, injection testing (SQL/XSS/SSRF/command), secret scanning in source code, auth bypass testing, dependency vulnerability scanning. Pen-test-style checks with safe mode default. Use before any launch or security review.
triggers:
  - security audit
  - security check
  - pen test
  - vulnerability scan
  - check security
---

# Security Auditor

Automated security testing tool that probes web applications for vulnerabilities — pen-test-style checks.

## Quick Start

```bash
# Full audit
security-auditor review https://example.com --source-dir ./myproject --output-dir /tmp/audit

# Individual scans
security-auditor headers https://example.com
security-auditor secrets ./src
security-auditor deps ./project
security-auditor injection https://example.com
security-auditor auth --auth-config auth.json
```

## Commands

### `headers <url>` — HTTP Security Headers
Checks HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CORS headers, Cache-Control, cookie flags. Grades A-F.

### `injection <url>` — Injection Testing
Tests SQL injection, XSS, command injection, path traversal, SSRF, header injection, NoSQL injection. Safe mode by default; `--aggressive` for deeper testing.

### `secrets <dir>` — Secret Scanner
Regex + entropy-based scanning for API keys (AWS, GCP, OpenAI, Stripe, GitHub, etc.), private keys, passwords, JWTs, connection strings. Add `--git` to scan git history.

### `auth --auth-config <file>` — Auth Testing
Tests auth bypass (no token, malformed JWT, none-algorithm), IDOR, brute force detection, privilege escalation, HTTP method override.

Auth config format:
```json
{
  "baseUrl": "https://api.example.com",
  "token": "Bearer eyJ...",
  "protectedEndpoints": ["/api/profile"],
  "adminEndpoints": ["/api/admin/users"],
  "idorEndpoints": ["/api/users/2/data"],
  "loginEndpoint": "/api/login",
  "loginBody": { "email": "test@test.com", "password": "wrong" }
}
```

### `deps <dir>` — Dependency Scanner
Runs `npm audit`, checks outdated packages, license compliance (flags GPL in proprietary projects).

### `review <url>` — Full Audit Orchestrator
Runs all scans and generates a combined report. Options: `--quick`, `--full`, `--aggressive`, `--compare DIR`.

### `report <dir>` — Report Generator
Aggregates scan results into markdown + JSON with CVSS-like scoring and remediation steps.

## Output
- `security-report.md` — Human-readable report
- `security-report.json` — Machine-readable with scores
- Individual scan JSONs in output directory

## Dependencies
Node.js built-in modules only (http, https, fs, path, child_process). No npm install needed.
