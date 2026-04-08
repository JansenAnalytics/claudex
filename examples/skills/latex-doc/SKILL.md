---
description: "Converts Markdown → LaTeX → PDF. Handles Mermaid diagrams, math, tables, citations, figures."
name: latex-doc
---

# latex-doc

Converts Markdown → LaTeX → PDF. Handles Mermaid diagrams, math, tables, citations, figures.

## Workflow

1. Write or receive content as a `.md` file with YAML front-matter
2. Run `scripts/build.py` with the chosen template
3. Deliver the resulting PDF

## Quick build

```bash
python3 ~/openclaw/skills/latex-doc/scripts/build.py input.md \
  --template whitepaper \
  --output output.pdf
```

## Templates

| Name            | Style                                         | Best for                    |
| --------------- | --------------------------------------------- | --------------------------- |
| `master-thesis` | Times New Roman, formal, full front matter    | Academic papers, theses     |
| `whitepaper`    | Georgia, navy cover banner, coloured headings | Industry reports, proposals |
| `minimal`       | Latin Modern, clean centred title             | Notes, memos, quick docs    |

See `references/templates.md` for full front-matter keys and examples for each template.

## All options

```
--template    master-thesis | whitepaper | minimal  (default: whitepaper)
--output      path/to/output.pdf
--bib         path/to/references.bib
--logo        path/to/logo.png or .pdf
--toc         add table of contents
--keep-tex    also save the intermediate .tex file
```

## Markdown front-matter (YAML)

Always include at the top of the .md file:

```yaml
---
title: "Document Title"
subtitle: "Optional subtitle"
author:
  - Name One
  - Name Two
date: "March 2025"
abstract: "One paragraph summary."
toc: true # optional
bibliography: refs.bib # optional
---
```

## Mermaid diagrams

Fenced ` ```mermaid ``` ` blocks are automatically rendered to PNG before compilation.
Requires `mmdc` — install once with `bash ~/openclaw/skills/latex-doc/scripts/setup.sh`.

## Math

Use standard LaTeX math syntax (pandoc `+tex_math_dollars`):

- Inline: `$E=mc^2$`
- Display: `$$\nabla \cdot E = \rho/\varepsilon_0$$`

## Citations

With `--bib refs.bib`, use `[@key2021]` in the markdown. Output uses APA style.

## First-time setup (if tools not installed)

```bash
bash ~/openclaw/skills/latex-doc/scripts/setup.sh
```

Installs: `texlive-xetex`, `texlive-latex-extra`, `biber`, `pandoc`, `@mermaid-js/mermaid-cli`.

## Troubleshooting

- **Font not found** → ensure `texlive-fonts-recommended` is installed; for `master-thesis` the system needs Times New Roman (install `fonts-liberation` or `ttf-mscorefonts-installer`)
- **Mermaid fails** → run `npx @mermaid-js/mermaid-cli --version`; check puppeteer sandbox config at `assets/puppeteer.json`
- **biber not found** → `sudo apt-get install biber`
- **xelatex errors** → run with `--keep-tex` and inspect the .tex file; rerun `xelatex` manually for full log
