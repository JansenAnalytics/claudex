# Install: perf-profiler

This skill profiles runtime performance (bundle size, memory, load testing,
CPU) using Playwright + Chromium for the browser-driven measurements.

## Prerequisites
- Node.js 22+
- `playwright-core`
- A Chromium binary (system Chromium or a Playwright-managed one)

## Setup
```bash
npm install -g playwright-core    # or install locally where the skill runs

# Provide Chromium — either the system package…
sudo apt-get install -y chromium-browser        # Debian/Ubuntu/WSL
# …or let Playwright fetch one:
npx playwright install chromium
```

## Configuration
- Set `CHROME_BIN=/path/to/chromium` if Chromium is in a non-standard location.

## Verification
```bash
node "${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/perf-profiler/scripts/report.cjs" --help
```
