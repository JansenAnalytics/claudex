# Contributing to Claudex

Thanks for your interest in contributing!

## How to Contribute

### Skills
The easiest way to contribute is adding new skills:

1. Create a new directory under `examples/skills/<skill-name>/`
2. Add a `SKILL.md` with YAML frontmatter (`name`, `description`) and instructions
3. Test it with Claude Code in your own workspace
4. Open a PR with a brief description of what the skill does

### Documentation
Improvements to docs are always welcome:
- Fix typos, clarify instructions
- Add troubleshooting tips from your own experience
- Improve the setup guides for different platforms

### Bug Fixes
If you hit an issue:
1. Check [Debugging & Gotchas](README.md#debugging--gotchas) first
2. Open an issue describing the problem, your platform, and Claude Code version
3. If you found a fix, open a PR

## Code Style
- Shell scripts: `set -euo pipefail`, use `bash` (not `sh`)
- Markdown: ATX headers, fenced code blocks with language tags
- Keep things simple and well-commented

## What Not to Submit
- Personal data, API keys, or tokens (even in examples)
- Skills that depend on paid third-party services without alternatives
- Massive binary files

## License
By contributing, you agree that your contributions will be licensed under the MIT License.
