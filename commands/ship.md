---
description: Commit and push current work with guardrails — branch-safe, secret-safe, conventional message
allowed-tools: Bash, Read
argument-hint: [message]
---

Commit and push the current work safely. Honor the user's git identity (`<your-git-email>`, GitHub user `<your-github-username>`). Use `~/.local/bin/gh` for any GitHub auth/remote ops. Work through the steps in order; STOP early if a gate fails. Optional commit message: $ARGUMENTS.

1. **Repo check** — run `git rev-parse --show-toplevel`. If it errors (not a git repo), report "Not a git repo — nothing to ship" and STOP.
2. **Change check** — run `git status --porcelain` and `git diff --stat HEAD`. If both are empty (clean tree, nothing staged/unstaged), report "Working tree clean — nothing to commit" and STOP.
3. **Secret safety** — inspect the changed file list. ABORT (do not stage/commit) and warn if any of these are about to be committed:
   - files matching `.env`, `*.key`, `*.pem`, `*.secret`, `id_rsa*`, `*credentials*`
   - `git diff HEAD` content matching `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `sk-`, `ghp_`, `github_pat_`, or other token-like strings
   List the offending file(s)/line(s) and STOP. Tell the user to gitignore or unstage them first.
4. **Branch guard** — run `git rev-parse --abbrev-ref HEAD`. If on `main` or `master`: do NOT commit straight to it. Derive a short kebab slug from the change and create + switch to `feat/<slug>` via `git checkout -b feat/<slug>` BEFORE committing. (Exception: a tiny docs-only fix may go to main — but ask the user first; don't assume.) If already on a feature branch, stay on it.
5. **Commit** — `git add -A`, then commit. Use `$ARGUMENTS` verbatim as the subject if provided; otherwise generate a conventional-commit subject (`feat:` / `fix:` / `docs:` / `chore:`) inferred from the diff. End every commit message with a blank line and the trailer:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
   Set author/committer to the user's identity if not already configured.
6. **Push** — `git push -u origin HEAD`. If no remote exists or push fails on auth, report the exact error and STOP (don't silently retry).
7. **Report** — one Telegram-friendly message, bullets only:
   - **Branch:** `<name>`
   - **Commit:** `<short-sha>` — subject line
   - **Files:** count + key paths
   - **Push:** ✅ pushed / ❌ failed (with reason)
   If the branch warrants a PR (feature branch, non-main target), OFFER: "Want me to open a PR? `gh pr create ...`" — do NOT auto-open one. Don't pad. Don't congratulate.
