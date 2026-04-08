---
name: git-bisect-auto
description: "Automated git bisect to find the exact commit that introduced a bug. Run a test command against each bisect step, report the first bad commit with full context."
---

# git-bisect-auto

Automated git bisect to find the exact commit that introduced a bug. Run a test command against each bisect step, report the first bad commit with full context.

## When to Use

- A regression was introduced and you need to find which commit caused it
- Narrowing down bug introductions in large commit ranges
- Automating binary search through git history
- Generating regression reports for issues/PRs

## Scripts

### auto-bisect.sh

Automated git bisect runner with safety features.

```bash
# Find which commit broke the tests
bash scripts/auto-bisect.sh --good v1.0 --bad HEAD --test "npm test"

# Find which commit introduced a file
bash scripts/auto-bisect.sh --good abc123 --bad def456 --test "test ! -f bug.txt"

# Find which commit broke compilation
bash scripts/auto-bisect.sh --good main~20 --bad main --test "make build"
```

**Features:**

- Stashes uncommitted changes before starting, restores after
- Runs `git bisect start`, sets good/bad, then `git bisect run`
- After completion: shows first bad commit, author, date, message, diff stats, changed files
- Cleans up bisect state even on failure

**Test command convention:** Exit 0 = good (no bug), exit non-zero = bad (bug present). Exit 125 = skip (untestable commit).

### bisect-test-gen.sh

Generate ready-to-use test scripts for common bisect scenarios.

```bash
# Does it compile?
bash scripts/bisect-test-gen.sh --type compile --params "make build"

# Does a specific test pass?
bash scripts/bisect-test-gen.sh --type test --params "pytest tests/test_auth.py"

# Does the server start (and respond)?
bash scripts/bisect-test-gen.sh --type server --params "npm start,http://localhost:3000,5"

# Does a URL return 200?
bash scripts/bisect-test-gen.sh --type http --params "http://localhost:3000/api/health"

# Does output contain/not contain a string?
bash scripts/bisect-test-gen.sh --type grep --params "npm run build,error,invert"
```

Output: executable test script written to `bisect-test.sh`.

### regression-report.sh

Generate a detailed regression report for the bad commit.

```bash
# Generate report for a commit
bash scripts/regression-report.sh abc123def

# With repo context
bash scripts/regression-report.sh abc123def --repo /path/to/repo
```

**Output:** Markdown report with commit info, full diff, files changed, author, related commits by same author. Ready for issue/PR description.

## References

- `references/bisect-strategies.md` — When to use bisect, preparing tests, handling flaky tests, merge commits, skipping commits
