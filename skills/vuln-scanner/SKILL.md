---
name: vuln-scanner
description: Vulnerability Scanner Skill
---

# Vulnerability Scanner Skill

Use when: checking if any projects have security vulnerabilities, or when adding a new npm project.

## Run a scan now

node /home/ajans/projects/vuln-scanner/scan.cjs

## Scan specific project

node /home/ajans/projects/vuln-scanner/scan.cjs --project <name>

## Dry run (no alerts)

node /home/ajans/projects/vuln-scanner/scan.cjs --dry-run

## View last scan results

node /home/ajans/projects/vuln-scanner/report.cjs

## Cron

Weekly on Sundays at 09:00: scans all projects with package.json in ~/projects/

## Config

~/projects/vuln-scanner/config.json

## Adding projects without package.json in ~/projects/

node /home/ajans/projects/vuln-scanner/add-project.cjs --path ~/projects/myapp --manager npm
