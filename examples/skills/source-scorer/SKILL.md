---
name: source-scorer
description: Source Credibility Scorer Skill
---

# Source Credibility Scorer Skill

Use when: evaluating whether a source is trustworthy, comparing multiple sources, or when research-reporter findings need credibility validation.

## Score a single source

```
node /home/ajans/projects/source-scorer/score.cjs --url "https://..." [--content "text"] [--claim "specific claim"]
```

## Score with JSON output (for piping)

```
node /home/ajans/projects/source-scorer/score.cjs --url "https://..." --json
```

## Score multiple URLs

```
echo -e "https://url1\nhttps://url2" > /tmp/urls.txt
node /home/ajans/projects/source-scorer/score-batch.cjs --urls-file /tmp/urls.txt
```

## Check domain tier

```
node /home/ajans/projects/source-scorer/domain-tier.cjs example.com
```

## Auto-integration

research-reporter's `add-finding.cjs` auto-scores when `--url` is provided.
The credibility score is saved with the finding and confidence is averaged with the user-provided value.

## Score interpretation

```
80–100  🟢 High credibility    — use with confidence
55–79   🟡 Moderate            — use, but cross-reference
30–54   🟠 Low credibility     — flag as unverified
0–29    🔴 Unreliable          — avoid or explicitly mark as speculation
```

## Scoring model (0–100 total)

| Factor          | Max | Notes                                              |
| --------------- | --- | -------------------------------------------------- |
| Domain tier     | 35  | docs.\*/gov/edu=35, major tech=28, pubs=20, Q&A=12 |
| HTTPS           | 10  | URL starts with https://                           |
| Content depth   | 15  | Word count + citation/reference patterns           |
| Cross-reference | 20  | Claim found in knowledge base from other docs      |
| Consistency     | 20  | Default 20 (reserved for research-reporter)        |

## Key signals that boost score

- `docs.*` subdomains, `.gov`, `.edu`: highest tier (Tier 1, 35pts)
- HTTPS: required for any real trust (+10pts)
- Long content with references: shows substantive work (+up to 15pts)
- Claim appears in knowledge base from other sources: strong confirmation (+20pts)

## Files

- `~/projects/source-scorer/score.cjs` — single URL scorer
- `~/projects/source-scorer/score-batch.cjs` — batch scorer from file
- `~/projects/source-scorer/domain-tier.cjs` — domain tier lookup
- `~/projects/source-scorer/tiers.json` — tier classification data
