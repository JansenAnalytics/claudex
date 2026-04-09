---
name: adr-manager
description: ADR Manager Skill
---

# ADR Manager Skill

Use when: making a non-trivial technical decision — choosing between options, committing to an architecture, or accepting a tradeoff. Record it so future sessions don't have to guess.

Trigger: any time you make a design decision, choose between tools/approaches, or Aksel asks "why did we do it this way?"

## Create an ADR

```
node /home/ajans/projects/adr-manager/adr.cjs new \
  --project <project-name> \
  --title "Decision title" \
  --context "Why this decision was needed" \
  --options "option1,option2,option3" \
  --decision "chosen-option" \
  --rationale "Why this option was chosen" \
  --tradeoffs "What we gave up and why it's acceptable"
```

## List ADRs for a project

```
node /home/ajans/projects/adr-manager/adr.cjs list --project <name>
```

## List all ADRs across all projects

```
node /home/ajans/projects/adr-manager/adr.cjs list
```

## View an ADR

```
node /home/ajans/projects/adr-manager/adr.cjs view ADR-001 --project <name>
```

## Search

```
node /home/ajans/projects/adr-manager/adr.cjs search "query"
```

## Update status

```
node /home/ajans/projects/adr-manager/adr.cjs status ADR-001 Superseded --project <name>
```

## ADR files location

`~/projects/<project>/.adr/ADR-NNN-<slug>.md`

## When to create an ADR

- Choosing a database, language, or framework
- Deciding between build vs. buy
- Accepting a known tradeoff (e.g. no concurrency for simplicity)
- Any decision Aksel or future-Kite might question later
