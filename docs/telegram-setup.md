# Connecting Claude Code to Telegram

This guide walks you through connecting Claude Code to Telegram so you can chat with your AI assistant from your phone, desktop, or anywhere Telegram is available. By the end, you'll have a personal bot that talks directly to Claude.

---

## Prerequisites

Before you begin, make sure you have:

- **Claude Code installed and authenticated** — run `claude --version` to confirm. If it's not installed, see the [Claude Code installation guide](https://docs.anthropic.com/claude-code).
- **A Telegram account** — download Telegram from [telegram.org](https://telegram.org) and create an account if you don't have one.

---

## Step 1: Create a Telegram Bot

You create Telegram bots through BotFather, Telegram's official bot management service.

1. Open Telegram and search for **@BotFather** (blue checkmark, official).
2. Start a chat and send:
   ```
   /newbot
   ```
3. BotFather will ask for a **display name** — this is what people see in the chat header. Choose anything you like, e.g.:
   ```
   My Claude Assistant
   ```
4. Next, it asks for a **username** — this must end in `bot` and be unique across all of Telegram, e.g.:
   ```
   MyClaudeAssistantBot
   ```
5. If the username is taken, try variations until one is accepted.

6. BotFather will reply with your **bot token**. It looks like this:
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
   **Copy this and save it somewhere safe.** You'll need it in Step 3. Treat it like a password — anyone with this token can control your bot.

**Optional customization (recommended):**
- `/setdescription` — set a short bio shown in the bot's profile
- `/setuserpic` — upload a profile photo for the bot
- `/setcommands` — define a command menu (cosmetic only)

---

## Step 2: Install the Telegram Channel Plugin

Claude Code uses a plugin system for channel integrations. Install the Telegram plugin from the official marketplace:

```bash
/plugin install telegram@claude-plugins-official
```

This pulls from the `anthropics/claude-plugins-official` registry.

**⚠️ Requires Bun**

The plugin system depends on [Bun](https://bun.sh), a fast JavaScript runtime. If you don't have it:

```bash
curl -fsSL https://bun.sh/install | bash
```

Expected output:
```
######################################################################## 100.0%
bun was installed successfully to ~/.bun/bin/bun
```

After installing, add Bun to your PATH. Open your shell config (`~/.bashrc`, `~/.zshrc`, etc.) and add:

```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

Then reload it:

```bash
source ~/.bashrc   # or source ~/.zshrc
```

Verify Bun is working:

```bash
bun --version
# 1.x.x
```

Now retry the plugin install if it failed earlier:

```bash
/plugin install telegram@claude-plugins-official
```

---

## Step 3: Configure the Plugin with Your Bot Token

Now give Claude Code your bot token. Run this command inside Claude Code, replacing the placeholder with your actual token:

```
/telegram:configure 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

Claude Code stores this token securely in your local config — it's never sent anywhere except Telegram's servers when your bot communicates.

---

## Step 4: Launch Claude Code with the Telegram Channel

Start Claude Code with the Telegram channel enabled:

```bash
claude --channels plugin:telegram@claude-plugins-official
```

You should see output indicating the Telegram bot is connected and listening:

```
✓ Telegram channel active — bot @MyClaudeAssistantBot is online
```

Keep this terminal session running. Claude Code needs to be active to receive and respond to messages. If you want it running persistently, consider using `screen`, `tmux`, or a systemd service.

---

## Step 5: Pair Your Telegram Account

With the bot running, you need to link your personal Telegram account so Claude knows who you are.

1. Open Telegram and find your bot by searching for its username (e.g., `@MyClaudeAssistantBot`).
2. Send **any message** to the bot — something like `hello` works fine.
3. Back in your terminal, Claude Code will display a **pairing code**, e.g.:
   ```
   Pairing request received. Run: /telegram:access pair ABCD-1234
   ```
4. Run that command in Claude Code:
   ```
   /telegram:access pair ABCD-1234
   ```
5. Claude Code will confirm:
   ```
   ✓ Account paired successfully
   ```
6. Send another message to your bot on Telegram — you should get an intelligent response back. If you do, the connection is working.

---

## Step 6: Lock Down Access (Critical Security Step)

By default, your bot may respond to anyone who discovers it. **This is a serious security risk.** Enable the allowlist policy so only paired accounts can interact with Claude:

```
/telegram:access policy allowlist
```

Expected output:
```
✓ Policy set to allowlist — only paired accounts can interact
```

**Do not skip this step.** Without it, anyone who finds your bot's username on Telegram can use your Claude account, consume your API credits, and potentially access whatever tools or data Claude has available in your session.

---

## Step 7: Verify Everything Is Working

Send **"Hello"** to your bot from Telegram. You should receive a thoughtful, intelligent response from Claude — not a canned reply, but actual Claude output.

If it works: you're done! 🎉

---

## Access Configuration Reference

Your access settings are stored at:

```
~/.claude/channels/telegram/access.json
```

> **Note:** This is outside your workspace directory — it lives in your global Claude config folder.

The file structure looks like this:

```json
{
  "allowFrom": ["687053516"],
  "policy": "allowlist"
}
```

- `allowFrom` — list of Telegram user IDs allowed to interact with the bot
- `policy` — `"allowlist"` (recommended) or `"open"` (anyone can use it)

To add another account (family member, colleague), have them message your bot, then pair them with `/telegram:access pair <their-code>`. Their ID will be appended to `allowFrom` automatically.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Plugin not found` error | Install Bun first, then retry the plugin install |
| Bot doesn't respond at all | Check that `claude --channels ...` is still running in your terminal |
| `Unauthorized` error in Telegram | Re-pair your account: send a message to the bot, get the new code, run `/telegram:access pair <code>` |
| First response is very slow | Normal — the first message of a session takes a few seconds to warm up |
| Bot responds to strangers | Run `/telegram:access policy allowlist` immediately |

---

## Tips

- **Pick a descriptive username.** Something like `@YourNameClaudeBot` is easier to find later than a random string.
- **Multiple users are fine.** You can pair several accounts — useful for shared family assistants or small teams. Each person goes through the same pairing flow.
- **Groups work too.** You can add your bot to a Telegram group. Be aware that with `allowlist` policy, only paired members will get responses — unrecognized group members will be ignored.
- **Keep the terminal running.** Claude Code must be active to handle messages. Use `tmux` or `screen` to keep sessions alive across SSH disconnects:
  ```bash
  tmux new-session -s claude
  claude --channels plugin:telegram@claude-plugins-official
  # Detach with Ctrl+B, then D
  ```
- **Restart after config changes.** If you update your token or access policy, restart Claude Code for changes to take full effect.
