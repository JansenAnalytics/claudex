---
name: code-review
description: Review code for bugs, improvements, and best practices. Use when asked to review a file, PR, or codebase.
---

# Code Review

## Review Checklist
1. **Correctness** — Does it do what it's supposed to?
2. **Edge cases** — What happens with null, empty, boundary values?
3. **Error handling** — Are errors caught and handled properly?
4. **Security** — Any injection, exposure, or auth issues?
5. **Performance** — Any obvious bottlenecks or N+1 queries?
6. **Readability** — Clear naming, reasonable complexity, good comments?
7. **Testing** — Are tests present and meaningful?

## PR Review via GitHub
```bash
# List open PRs
gh pr list

# View PR details
gh pr view NUMBER

# View PR diff
gh pr diff NUMBER

# Add review comment
gh pr review NUMBER --comment --body "COMMENT"

# Approve
gh pr review NUMBER --approve

# Request changes
gh pr review NUMBER --request-changes --body "REASON"
```

## Output Format
For each issue found:
- **Severity:** 🔴 Critical / 🟡 Warning / 🔵 Suggestion
- **Location:** file:line
- **Issue:** What's wrong
- **Fix:** How to fix it
