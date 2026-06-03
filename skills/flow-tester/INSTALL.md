# Install: flow-tester

This skill drives end-to-end user-journey tests with Playwright + Chromium.

## Prerequisites
- Node.js 22+
- `playwright-core`
- A Chromium binary (system Chromium or a Playwright-managed one)

## Setup
```bash
# Install playwright-core (skill resolves it from node_modules on PATH / workspace)
npm install -g playwright-core    # or install locally where the skill runs

# Provide Chromium — either the system package…
sudo apt-get install -y chromium-browser        # Debian/Ubuntu/WSL
# …or let Playwright fetch one:
npx playwright install chromium
```

## Configuration
- The skill auto-detects a Chromium binary on the system. If yours is in a
  non-standard location, set `CHROME_BIN=/path/to/chromium` before running.

## Verification
```bash
node "${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/flow-tester/scripts/review.cjs" --help
```
