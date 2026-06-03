---
name: draft-queue
description: Draft Queue Skill
category: writing
maturity: beta
tags: [approval-queue, drafts, json-payload, telegram-action]
---

# Draft Queue Skill

Use when: you want to take an external action that requires the user's approval before executing.

## Add a draft

```
node ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/add-draft.cjs \
  --type <type> \
  --desc "description" \
  --payload '<json>'
```

## Types: telegram-message, shell-command, github-comment, github-pr-merge, file-write

### Payloads by type

**telegram-message**

```json
{ "chat_id": "<your-telegram-user-id>", "message": "text here" }
```

**shell-command**

```json
{ "command": "echo hello", "cwd": "$HOME" }
```

**github-comment**

```json
{ "repo": "JansenAnalytics/myrepo", "issue": 42, "body": "comment text" }
```

**github-pr-merge**

```json
{ "repo": "JansenAnalytics/myrepo", "pr": 7, "method": "squash" }
```

**file-write**

```json
{ "path": "/path/to/your/file.txt", "content": "file contents" }
```

## Approve (when the user says "approve ID")

```
node ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/approve.cjs <id>
```

## Reject (when the user says "reject ID")

```
node ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/reject.cjs <id>
```

## List pending

```
node ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/list-drafts.cjs
```

## List all

```
node ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/list-drafts.cjs --all
```

## List by status

```
node ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/list-drafts.cjs --status approved
```

## Notes

- Drafts file: `${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/drafts.json` (append-only)
- Cron for expiry: `0 9 * * * /usr/bin/node ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/expire-drafts.cjs >> ${DRAFT_QUEUE_HOME:-$HOME/projects/draft-queue}/draft-queue.log 2>&1`
- add-draft.cjs prints the draft ID to stdout on success
- Default expiry: 24 hours. Override with `--expires 7d` etc.
