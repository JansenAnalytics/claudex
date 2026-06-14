---
name: vuln-scanner
description: "Scan project dependencies for known security vulnerabilities (npm-audit style) across your projects and alert. Use when checking projects for vulnerabilities, after adding a new npm project, or reviewing the last scan results."
category: security
maturity: beta
tags: [vulnerability-scanning, npm-audit, cve, cron, alerts]
---

# Vulnerability Scanner Skill

Use when: checking if any projects have security vulnerabilities, or when adding a new npm project.

## Run a scan now

node ${VULN_SCANNER_HOME:-$HOME/projects/vuln-scanner}/scan.cjs

## Scan specific project

node ${VULN_SCANNER_HOME:-$HOME/projects/vuln-scanner}/scan.cjs --project <name>

## Dry run (no alerts)

node ${VULN_SCANNER_HOME:-$HOME/projects/vuln-scanner}/scan.cjs --dry-run

## View last scan results

node ${VULN_SCANNER_HOME:-$HOME/projects/vuln-scanner}/report.cjs

## Cron

Weekly on Sundays at 09:00: scans all projects with package.json in $HOME/projects/

## Config

${VULN_SCANNER_HOME:-$HOME/projects/vuln-scanner}/config.json

## Adding projects without package.json in $HOME/projects/

node ${VULN_SCANNER_HOME:-$HOME/projects/vuln-scanner}/add-project.cjs --path ~/projects/<your-app> --manager npm
