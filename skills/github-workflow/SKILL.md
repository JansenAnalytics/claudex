---
name: github-workflow
description: Git and GitHub operations — clone, branch, commit, push, PRs, issues, CI status. Use for any git or GitHub task.
---

# GitHub Workflow

## Tools
- **gh CLI**: `~/.local/bin/gh` — authenticated as JansenAnalytics
- **git**: Standard git commands

## Rules
- Feature branches always. Never push to main directly.
- `fixes #N` in commits auto-closes issues. `refs #N` does not.
- Use conventional commit messages when appropriate.

## Common Commands
```bash
# PR operations
gh pr create --title "..." --body "..."
gh pr list
gh pr status
gh pr merge <number>

# Issues
gh issue create --title "..." --body "..."
gh issue list --label "bug"

# CI/Actions
gh run list
gh run view <id> --log-failed

# Repo
gh repo create JansenAnalytics/<name> --private
gh repo clone JansenAnalytics/<name>
```

## Key Repos
- `prop-hedge-agents` — Trading system (branch: feature/agent-restructure)
- `prop-hedge-dashboard` — Dashboard (branch: master)
- `brewboard` — BCH analytics (branch: feature/frontend-polish)
