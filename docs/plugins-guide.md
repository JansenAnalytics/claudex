# Claude Code Plugins — Practical Guide

A plugin is a single installable bundle that ships any combination of the pieces
Claudex is already built from. This guide covers the mechanics: how plugins work,
adding the marketplace, install/remove, how they compose with our own
skills/commands/agents/hooks, and authoring your own.

**The curated shortlist of *which* plugins to install lives in
[`../plugins/recommended.md`](../plugins/recommended.md).** This doc is the *how*; that doc is the *what*.

---

## 1. How plugins work

A plugin is the **distribution wrapper** around the exact pieces we author by hand.
One bundle can contain any mix of:

- **commands/** — slash commands (same `.md` format as our `.claude/commands/`)
- **skills/** — `SKILL.md` skills (same as our 160 under `.claude/skills/`)
- **agents/** — subagent definitions (like our researcher / coder / reviewer)
- **hooks** — lifecycle hooks wired via `settings.json`
- **.mcp.json** — MCP server config (tools)
- optional LSP servers and output styles

Standard layout:

```
plugin-name/
├── .claude-plugin/plugin.json   # metadata (required)
├── .mcp.json                    # MCP servers (optional)
├── commands/  agents/  skills/  # same formats we already use
└── README.md
```

A **marketplace** is a git repo with a manifest listing many plugins. The official
one is `claude-plugins-official` (anthropics), cloned locally at
`~/.claude/plugins/marketplaces/claude-plugins-official/`. Anthropic-internal
plugins live under its `/plugins`; partner/community ones under `/external_plugins`.

**Trust matters.** A plugin can pull in MCP servers and code Anthropic does not
control. First-party (internal) plugins are lowest risk; external bridges carry
their own access control and code. Vet before installing — see section 5.

---

## 2. Adding the official marketplace

The official marketplace is the source for everything in `recommended.md`. Add it
once, then install plugins by name.

1. In-session, run `/plugin` to open the plugin manager.
2. Choose **Marketplaces > Add**, or add it directly:
   ```
   /plugin marketplace add anthropics/claude-plugins-official
   ```
3. Confirm it registered: `/plugin marketplace list` — you should see
   `claude-plugins-official` pointing at the anthropics repo.
4. Browse what's available with `/plugin > Discover`.

The clone lives at `~/.claude/plugins/marketplaces/claude-plugins-official/`. To
pull upstream updates later: `/plugin marketplace update claude-plugins-official`.

---

## 3. Install and remove

Install (note the `@<marketplace>` suffix — required):
```
/plugin install <name>@claude-plugins-official
```
Example:
```
/plugin install plugin-dev@claude-plugins-official
```

Other lifecycle actions (all via `/plugin`, or the explicit command form):

- **List installed** — `/plugin` opens the manager; installed plugins are listed.
- **Disable without removing** — `/plugin disable <name>` (keeps it on disk, stops loading it).
- **Re-enable** — `/plugin enable <name>`.
- **Remove** — `/plugin uninstall <name>`.

After install, a plugin's commands/skills/agents become available the same way our
hand-placed ones do — its slash commands show up under `/`, its skills are
auto-loaded, its subagents are spawnable. No manual file copying.

**Currently active:** only `telegram` (external bridge) — the channel Claudex talks
to the user through, access managed via `/telegram:access`. Nothing else is installed
yet; pull from the `recommended.md` shortlist.

---

## 4. How plugins compose with our skills / commands / agents / hooks

Plugins don't replace our setup — they layer onto the same mechanisms:

- **Same formats.** A plugin's `commands/foo.md` is the identical format to our
  `.claude/commands/foo.md`; a plugin skill is the same `SKILL.md` shape as the 160
  under `CLAUDE_SKILLS_DIR`. Installing a plugin is mechanically equivalent to us
  dropping those files in the workspace — just versioned and reversible.
- **Namespacing & precedence.** Plugin commands/skills coexist with ours. If names
  collide, prefer keeping our hand-authored version authoritative and disable the
  plugin's overlapping piece (`/plugin disable`) rather than letting two definitions
  of the same name compete. When in doubt, rename ours or theirs.
- **Hooks stack.** Plugin hooks wire into `settings.json` lifecycle events alongside
  our own (e.g. our `.claude/rules/safety.md`-style guardrails). Multiple hooks on
  the same event all run — additive, not exclusive. Review what a plugin's hooks do
  before enabling; a hook can block or mutate actions.
- **MCP servers add tools.** A plugin's `.mcp.json` registers new tools (databases,
  services) into the same tool surface Claudex already uses. These are real external
  connections — treat them like any other credential/tool grant.
- **Subagents.** Plugin agents join the pool next to researcher / coder / reviewer.
  Verify their output the same way (CLAUDE.md rule: don't trust self-reported success).

Practical rule: a plugin is "more of the same kind of thing we already run," so the
same discipline applies — vet it, then it just works through the normal channels.

---

## 5. Authoring your own

The canonical, supported path is the **plugin-dev** plugin — don't hand-roll the
structure.

1. Install it: `/plugin install plugin-dev@claude-plugins-official`.
2. Run its `/create-plugin` command to scaffold.
3. It ships a skill for every layer — `plugin-structure`, `command-development`,
   `skill-development`, `agent-development`, `hook-development`, `mcp-integration`,
   `plugin-settings` — plus validator/reviewer agents. Use those rather than guessing
   the schema.
4. Validate with plugin-dev's `plugin-validator` agent before shipping.

**Packaging Claudex itself** is plausible (we're already plugin-shaped: `commands/`,
`skills/`, subagents, `rules/`) but is real work, not a copy job — most of our skills
hardcode absolute paths (`$HOME/.claude-agent/...`) and local scripts, so a
publishable plugin must be made path-portable first. Full steps live in
[`../plugins/recommended.md`](../plugins/recommended.md) section 3.

**Hard rules when authoring/publishing:**

- **Never bundle secrets.** No Telegram bot token, no `ANTHROPIC_API_KEY`. Secrets in
  `.env` never go into a plugin or to git.
- A plugin repo is its own git repo. The workspace may not be a git repo today —
  `git init` a dedicated plugin repo; never try to publish the whole `~/.claude-agent`.
- Host as a git repo with a marketplace manifest, OR submit to the official directory
  via the submission form (linked in `recommended.md`).

---

## See also

- **[`../plugins/recommended.md`](../plugins/recommended.md)** — the curated shortlist:
  which Anthropic-maintained plugins pair well with Claudex, with verified install
  commands.
- `/plugin` — in-session plugin manager (Discover, install, enable/disable, uninstall).
