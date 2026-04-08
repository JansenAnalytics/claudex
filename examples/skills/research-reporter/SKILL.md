---
name: research-reporter
description: Research Reporter Skill
---

# Research Reporter Skill

Use when: doing multi-source research and want findings saved as a structured report.

## Workflow

1. For each source found, add a finding:

   ```
   node /home/ajans/projects/research-reporter/add-finding.cjs \
     --session "topic-slug" \
     --source "Source Name" \
     --url "https://..." \
     --content "key finding text" \
     --confidence 0.8 \
     --tags "tag1,tag2"
   ```

2. When done researching, compile:
   ```
   node /home/ajans/projects/research-reporter/compile.cjs \
     --session "topic-slug" \
     --title "Report Title" \
     --send
   ```

## Confidence guide

- 0.9–1.0: Official docs, primary sources, direct quotes
- 0.7–0.89: Reputable secondary sources, well-known publications
- 0.5–0.69: Blogs with citations, community answers with upvotes
- 0.1–0.49: Unverified, single-source claims, Reddit/forum posts

## Session naming

Use kebab-case slugs: "stripe-webhooks", "gpt-4o-pricing", "competitor-analysis-jan-2026"

## List sessions

```
node /home/ajans/projects/research-reporter/list-sessions.cjs
```

## List saved reports

```
node /home/ajans/projects/research-reporter/list-reports.cjs
```

## Reports are saved to

`~/workspace/reports/YYYY-MM-DD-<slug>.md`
