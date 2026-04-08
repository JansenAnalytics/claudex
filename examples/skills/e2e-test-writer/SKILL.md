---
name: e2e-test-writer
description: "Generate end-to-end tests for web applications using Playwright. Create test files from user flow descriptions, page snapshots, or existing page analysis."
---

# e2e-test-writer

Generate end-to-end tests for web applications using Playwright. Create test files from user flow descriptions, page snapshots, or existing page analysis.

## When to Use

- Adding E2E test coverage to a web application
- Generating regression tests after building features
- Creating smoke tests for critical user flows
- Automating user flow verification
- Setting up Playwright test infrastructure from scratch

## Scripts

### generate-test.py

Generates a complete Playwright test file from a JSON flow description.

```bash
# From a JSON file
python3 scripts/generate-test.py --input flow.json --output tests/login.spec.ts

# From stdin
echo '{"name":"login","steps":[{"action":"goto","url":"/"},{"action":"fill","selector":"#email","value":"test@test.com"},{"action":"click","selector":"button[type=submit]"},{"action":"assert_text","text":"Welcome"}]}' | python3 scripts/generate-test.py --output tests/login.spec.ts

# JavaScript output instead of TypeScript
python3 scripts/generate-test.py --input flow.json --output tests/login.spec.js --lang js
```

**Flow JSON format:**

```json
{
  "name": "login",
  "baseURL": "http://localhost:3000",
  "steps": [
    { "action": "goto", "url": "/login" },
    { "action": "fill", "selector": "#email", "value": "test@test.com" },
    { "action": "fill", "selector": "#password", "value": "secret123" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "assert_url", "url": "/dashboard" },
    { "action": "assert_text", "text": "Welcome back" },
    { "action": "assert_visible", "selector": ".user-avatar" },
    { "action": "screenshot", "name": "dashboard-loaded" },
    { "action": "select", "selector": "#role", "value": "admin" },
    { "action": "wait", "ms": 1000 }
  ]
}
```

**Supported actions:** goto, click, fill, select, assert_text, assert_url, assert_visible, wait, screenshot

### flow-recorder.sh

Creates a template JSON flow file with placeholder steps.

```bash
bash scripts/flow-recorder.sh --name "login-flow" --steps 5
bash scripts/flow-recorder.sh --name "checkout" --steps 8 --output flows/checkout.json
```

### test-scaffold.sh

Sets up Playwright test infrastructure in a project directory.

```bash
bash scripts/test-scaffold.sh --project-dir /path/to/project --base-url http://localhost:3000
```

Creates:

- `tests/` directory
- `playwright.config.ts`
- `package.json` test scripts (or updates existing)
- Sample test file
- Test suite README

## References

- `references/playwright-patterns.md` — Page objects, fixtures, network mocking, visual comparison, parallel execution, CI integration
- `references/user-flow-templates.md` — Template flows for auth, CRUD, search/filter, navigation, form validation

## Examples

### Quick test generation

```bash
# 1. Create a flow template
bash scripts/flow-recorder.sh --name "signup" --steps 6 --output signup-flow.json

# 2. Edit the JSON to fill in real selectors and values

# 3. Generate the test
python3 scripts/generate-test.py --input signup-flow.json --output tests/signup.spec.ts
```

### Full project setup

```bash
# 1. Scaffold test infrastructure
bash scripts/test-scaffold.sh --project-dir ./my-app --base-url http://localhost:3000

# 2. Generate tests from flows
python3 scripts/generate-test.py --input flows/login.json --output my-app/tests/login.spec.ts

# 3. Run tests
cd my-app && npx playwright test
```
