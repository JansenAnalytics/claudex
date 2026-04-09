---
name: arch-diagram
description: "Generate architecture diagrams from codebase analysis: Mermaid, PlantUML, or ASCII."
---

# arch-diagram

Generate architecture diagrams from codebase analysis: Mermaid, PlantUML, or ASCII.

## When to Use

- Visualizing system architecture
- Documenting component relationships
- Creating sequence diagrams
- Mapping dependencies from package.json or imports
- Generating diagrams for documentation or PRs

## How It Works

1. Point `dep-graph.sh` at a project to extract dependencies
2. Use `mermaid-gen.sh` to produce Mermaid diagram syntax
3. Use `ascii-diagram.sh` for quick terminal-friendly box diagrams
4. Consult references for syntax help and diagram type selection

## Scripts

| Script             | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `dep-graph.sh`     | Extract dependency graph from package.json or import statements |
| `mermaid-gen.sh`   | Generate Mermaid diagram markup from components/relationships   |
| `ascii-diagram.sh` | Generate ASCII box-and-arrow diagrams                           |

## References

| File                   | Content                                   |
| ---------------------- | ----------------------------------------- |
| `mermaid-syntax.md`    | Mermaid diagram syntax quick reference    |
| `plantuml-syntax.md`   | PlantUML syntax quick reference           |
| `diagram-selection.md` | Guide for choosing the right diagram type |

## Example Usage

```bash
# Extract deps from a Node.js project
bash scripts/dep-graph.sh --path /path/to/project --type node

# Generate a Mermaid flowchart
bash scripts/mermaid-gen.sh --type flowchart \
  --components "API,Database,Cache,Queue" \
  --relations "API->Database,API->Cache,API->Queue"

# Quick ASCII diagram
bash scripts/ascii-diagram.sh \
  --components "Client,API Gateway,Auth Service,DB" \
  --relations "Client->API Gateway,API Gateway->Auth Service,Auth Service->DB"
```
