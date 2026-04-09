---
name: design-system
description: "Enforce design consistency: component inventory, style token extraction, CSS consistency checking, spacing/color/typography auditing."
---

# design-system

Enforce design consistency: component inventory, style token extraction, CSS consistency checking, spacing/color/typography auditing.

## When to Use

- Auditing UI consistency across a project
- Extracting design tokens from CSS/SCSS
- Building component inventories
- Checking for style drift or inconsistencies
- Standardizing a design system

## Scripts

### token-extractor.py

Extract design tokens (colors, fonts, spacing) from CSS/SCSS files.

```bash
python3 scripts/token-extractor.py --dir src/
python3 scripts/token-extractor.py --dir styles/ --format json
```

**Arguments:**

- `--dir <path>` — Directory to scan (default: `.`)
- `--format json|markdown` — Output format (default: markdown)

### style-auditor.sh

Audit CSS for consistency issues.

```bash
bash scripts/style-auditor.sh --dir src/
```

**Arguments:**

- `--dir <path>` — Directory to scan (default: `.`)

Reports: unique colors, near-duplicate colors, font sizes, spacing values, z-index values, unit mixing.

### component-inventory.sh

Build component inventory from React/Vue project.

```bash
bash scripts/component-inventory.sh --dir src/
```

**Arguments:**

- `--dir <path>` — Directory to scan (default: `.`)

Reports: component name, file path, props, usage count, unused components, untested components.

## References

- `design-tokens-guide.md` — Design token concepts and naming conventions
