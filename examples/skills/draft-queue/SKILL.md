---
name: draft-queue
description: Draft Queue Skill
---

# Draft Queue Skill

Use when: you want to take an external action that requires Aksel's approval before executing.

## Add a draft

```
node /home/ajans/projects/draft-queue/add-draft.cjs \
  --type <type> \
  --desc "description" \
  --payload '<json>'
```

## Types: telegram-message, shell-command, github-comment, github-pr-merge, file-write

### Payloads by type

**telegram-message**

```json
{ "chat_id": "687053516", "message": "text here" }
```

**shell-command**

```json
{ "command": "echo hello", "cwd": "/home/ajans" }
```

**github-comment**

```json
{ "repo": "janseninvest/myrepo", "issue": 42, "body": "comment text" }
```

**github-pr-merge**

```json
{ "repo": "janseninvest/myrepo", "pr": 7, "method": "squash" }
```

**file-write**

```json
{ "path": "/home/ajans/some/file.txt", "content": "file contents" }
```

## Approve (when Aksel says "approve ID")

```
node /home/ajans/projects/draft-queue/approve.cjs <id>
```

## Reject (when Aksel says "reject ID")

```
node /home/ajans/projects/draft-queue/reject.cjs <id>
```

## List pending

```
node /home/ajans/projects/draft-queue/list-drafts.cjs
```

## List all

```
node /home/ajans/projects/draft-queue/list-drafts.cjs --all
```

## List by status

```
node /home/ajans/projects/draft-queue/list-drafts.cjs --status approved
```

## Notes

- Drafts file: `/home/ajans/projects/draft-queue/drafts.json` (append-only)
- Cron for expiry: `0 9 * * * /usr/bin/node /home/ajans/projects/draft-queue/expire-drafts.cjs >> /home/ajans/projects/draft-queue/draft-queue.log 2>&1`
- add-draft.cjs prints the draft ID to stdout on success
- Default expiry: 24 hours. Override with `--expires 7d` etc.
