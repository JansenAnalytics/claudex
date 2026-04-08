---
name: test-runner
description: "Run and interpret test suites across frameworks: Jest, Vitest, pytest, Mocha, tap. Use when: running tests, debugging test failures, generating coverage reports, writing test fixtures, or setting u..."
---

# test-runner

Run and interpret test suites across frameworks: Jest, Vitest, pytest, Mocha, tap. Use when: running tests, debugging test failures, generating coverage reports, writing test fixtures, or setting up test infrastructure for a project.

## Usage

### Run Tests

```bash
bash scripts/run-tests.sh [path]
```

Auto-detects framework from project files. Pass optional path to scope test run.

### Coverage Report

```bash
bash scripts/coverage-report.sh [path]
```

Runs tests with coverage and summarizes results.

### Detect Flaky Tests

```bash
bash scripts/flaky-detector.sh [path] [runs]
```

Runs test suite multiple times (default: 5) and reports tests with inconsistent results.

## When to Use

- Running tests in an unfamiliar project (auto-detects framework)
- Debugging test failures — scripts parse output for actionable info
- Checking coverage before a PR
- Investigating flaky tests that pass/fail intermittently
- Setting up test infrastructure for a new project

## Framework Detection

Priority order:

1. `vitest.config.*` → Vitest
2. `jest.config.*` or `"jest"` in package.json → Jest
3. `.mocharc.*` or `"mocha"` in package.json → Mocha
4. `"tap"` in package.json → tap
5. `pytest.ini` / `pyproject.toml` with `[tool.pytest]` / `setup.cfg` with `[tool:pytest]` → pytest
6. Fallback: `npm test` if package.json exists, `python -m pytest` if `.py` test files exist

## Resources

- `scripts/run-tests.sh` — Universal test runner with framework detection
- `scripts/coverage-report.sh` — Coverage reporter
- `scripts/flaky-detector.sh` — Flaky test detector
- `references/framework-detection.md` — Detection logic details
- `references/assertion-patterns.md` — Common assertion patterns across frameworks
- `references/mocking-patterns.md` — Mocking/stubbing patterns
