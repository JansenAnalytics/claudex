---
name: knowledge-base
description: Knowledge Base Skill
---

# Knowledge Base Skill

Use when: ingesting documents, searching stored knowledge, building research context.

## Ingest a URL

```
node /home/ajans/projects/knowledge-base/ingest.cjs add <url>
```

## Ingest a local file

```
node /home/ajans/projects/knowledge-base/ingest.cjs add --file <path>
```

## Ingest a PDF

```
node /home/ajans/projects/knowledge-base/ingest.cjs add --pdf <path>
```

## Search

```
node /home/ajans/projects/knowledge-base/search.cjs "query"
node /home/ajans/projects/knowledge-base/search.cjs "query" --limit 10
node /home/ajans/projects/knowledge-base/search.cjs "query" --context
```

## List all documents

```
node /home/ajans/projects/knowledge-base/ingest.cjs list
```

## Remove a document

```
node /home/ajans/projects/knowledge-base/ingest.cjs remove <id>
```

## Update (re-fetch) a document

```
node /home/ajans/projects/knowledge-base/ingest.cjs update <id>
```

## Notes

- DB lives at: `/home/ajans/projects/knowledge-base/kb.sqlite`
- Uses SQLite FTS5 with BM25 ranking
- Chunks are ~500 words each
- URL deduplication: re-run with `update <id>` to refresh
- Supports: URLs, local text/markdown files, PDFs (if pdftotext installed)
