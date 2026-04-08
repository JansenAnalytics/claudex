---
name: post-mortem
description: "Generate structured post-mortems after incidents or failures: root cause analysis, timeline, impact assessment, prevention steps."
---

# post-mortem

Generate structured post-mortems after incidents or failures: root cause analysis, timeline, impact assessment, prevention steps.

## When to Use

- Analyzing why something broke
- Documenting incidents for the team
- Creating action items after failures
- Reviewing production issues
- Running blameless retrospectives

## How It Works

1. Gather incident details (what happened, when, who noticed)
2. Run `generate-postmortem.sh` to create a structured document
3. Use `timeline-builder.sh` to construct a precise event timeline
4. Use `action-tracker.sh` to extract and track action items
5. Review references for blameless culture and root cause categories

## Scripts

| Script                   | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `generate-postmortem.sh` | Generate a full post-mortem document from parameters     |
| `timeline-builder.sh`    | Build a formatted incident timeline from events          |
| `action-tracker.sh`      | Extract, list, and track action items from a post-mortem |

## References

| File                       | Content                                     |
| -------------------------- | ------------------------------------------- |
| `postmortem-template.md`   | Full post-mortem template with all sections |
| `blameless-guide.md`       | Guide to running blameless post-mortems     |
| `root-cause-categories.md` | Common root cause taxonomy                  |

## Example Usage

```bash
# Generate a post-mortem document
bash scripts/generate-postmortem.sh \
  --title "API Gateway Outage" \
  --severity P1 \
  --date "2024-01-15" \
  --duration "2h 30m" \
  --summary "API gateway became unresponsive due to connection pool exhaustion" \
  --output postmortem-2024-01-15.md

# Build a timeline
bash scripts/timeline-builder.sh \
  --add "14:00 Monitoring alerts fire for high latency" \
  --add "14:05 On-call engineer acknowledges alert" \
  --add "14:15 Root cause identified: connection pool exhaustion" \
  --add "14:20 Fix deployed: increased pool size" \
  --add "14:30 Service fully recovered" \
  --output timeline.md

# Track action items
bash scripts/action-tracker.sh --extract postmortem-2024-01-15.md
bash scripts/action-tracker.sh --list postmortem-2024-01-15.md
```
