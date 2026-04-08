---
name: doc-generator
description: "Auto-generate documentation from code: README files, JSDoc comments, API docs. Scans project structure, detects frameworks, and produces ready-to-use documentation."
---

# doc-generator

Auto-generate documentation from code: README files, JSDoc comments, API docs. Scans project structure, detects frameworks, and produces ready-to-use documentation.

## When to Use

- Adding documentation to undocumented code
- Generating README from project structure
- Creating API documentation from Express/Fastify routes
- Adding JSDoc/TSDoc comments to JavaScript/TypeScript functions
- Keeping docs in sync with code changes

## Scripts

### generate-readme.sh

Auto-generate README.md by scanning project files.

```bash
# Generate README for current directory
bash scripts/generate-readme.sh --dir .

# Specify output file
bash scripts/generate-readme.sh --dir /path/to/project --output README.md
```

**Detects:** package.json, pyproject.toml, Makefile, Dockerfile, framework (React, Express, FastAPI, etc.)

**Generates sections:** Title, description, installation, usage, available scripts, project structure, dependencies, license.

### jsdoc-gen.py

Generate JSDoc comments for undocumented JavaScript/TypeScript functions.

```bash
# Generate documented version
python3 scripts/jsdoc-gen.py --file src/utils.js --output src/utils.documented.js

# In-place modification
python3 scripts/jsdoc-gen.py --file src/utils.js --inplace

# Process all JS files in a directory
find src -name "*.js" -exec python3 scripts/jsdoc-gen.py --file {} --inplace \;
```

**Analyzes:** Parameter names, default values, TypeScript types, return statements, throw statements.

### api-doc-gen.sh

Generate API documentation from Express/Fastify route files.

```bash
# Scan routes directory
bash scripts/api-doc-gen.sh --routes-dir src/routes/ --output API.md

# Single file
bash scripts/api-doc-gen.sh --routes-dir src/routes/users.js --output API.md
```

**Extracts:** HTTP method, path, middleware (auth, validation), handler name. Outputs Markdown with endpoint tables.

## References

- `references/doc-templates.md` — README templates, JSDoc patterns, Python docstring formats
- `references/doc-best-practices.md` — What to document, keeping docs maintainable
