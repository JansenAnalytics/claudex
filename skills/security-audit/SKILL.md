---
name: security-audit
description: "Security auditing: vulnerability scanning, dependency checking, port scanning, permission review. Use when: auditing project security, scanning for CVEs in dependencies, checking open ports, review..."
---

# security-audit

Security auditing: vulnerability scanning, dependency checking, port scanning, permission review. Use when: auditing project security, scanning for CVEs in dependencies, checking open ports, reviewing file permissions, or hardening a deployment.

## Workflows

### Scan dependencies for vulnerabilities

```bash
bash scripts/dep-checker.sh [directory]
```

Auto-detects project type (npm/pip/cargo) and runs the appropriate audit tool.

### Scan open ports

```bash
bash scripts/port-scanner.sh [host] [port-range]
```

Scans a host for open TCP ports. Default: localhost, ports 1-1024.

### Audit file permissions

```bash
bash scripts/permission-auditor.sh [directory]
```

Finds world-writable files, SUID/SGID binaries, files owned by root in user dirs, and insecure config files.

### Check HTTP security headers

```bash
bash scripts/header-checker.sh <url>
```

Checks for missing security headers (CSP, HSTS, X-Frame-Options, etc.).

## Scripts

| Script                          | Purpose                          |
| ------------------------------- | -------------------------------- |
| `scripts/dep-checker.sh`        | Dependency vulnerability scanner |
| `scripts/port-scanner.sh`       | TCP port scanner                 |
| `scripts/permission-auditor.sh` | File permission auditor          |
| `scripts/header-checker.sh`     | HTTP security header checker     |

## References

| File                                | Contents                       |
| ----------------------------------- | ------------------------------ |
| `references/owasp-top10.md`         | OWASP Top 10 summary           |
| `references/hardening-checklist.md` | Server/app hardening checklist |
