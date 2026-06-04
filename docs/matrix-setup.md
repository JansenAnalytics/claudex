# Connecting Claudex to Matrix (end-to-end encrypted)

This guide connects Claudex to **Matrix** so you can chat with your agent over **end-to-end encryption** — suitable for sensitive data, and a privacy upgrade over the Telegram bot channel (Telegram bots are *not* E2EE; Telegram's servers see plaintext).

The design (see [RFC 0001](rfcs/0001-matrix-channel.md)) is **two local processes**:

```
Element (your phone, verified) ──E2EE──> Homeserver (matrix.org → later self-hosted)
                                              │
   matrix-sidecar (Rust, matrix-rust-sdk)  ◀──┘   owns ALL crypto + persistence + verified-only
        │  localhost HTTP (token-gated): /health /events /send
   matrix-bridge.py (Python stdlib)              access gate → claude -p → reply
        │
   claude (headless)
```

The **sidecar** owns cryptography (built on Element's audited `matrix-rust-sdk`). The **bridge** owns logic and has no third-party dependencies. Operationally it behaves like the other channels: same `start/stop/status/watchdog` tooling, same allowlist model.

---

## Quick start — one guided script (clean VPS → live)

On a **fresh VPS**, one script does everything: install the toolchain (build tools, Rust, Claude Code), authenticate Claude, create the workspace, build the sidecar, log the bot in (cross-signing bootstrap), pin your key, write the allowlist, install + start the services, and health-check.

```bash
git clone <claudex-repo> claudex && cd claudex
bash scripts/matrix-setup.sh
```

It is **idempotent** (re-run it any time; it skips finished steps and never clobbers your login/keys). A few steps are inherently interactive and it pauses for them: creating the bot account, approving Claude's and Matrix's browser sign-ins once, and — in Element — creating the encrypted room, inviting + verifying the bot, and copying your master cross-signing key. Useful flags: `--relogin`, `--reuse-session`, `--no-install-deps`, `--homeserver`, `--user`, `--human`.

The rest of this document explains each step (what the script automates) and is the **troubleshooting reference**.

---

## Security model — what this does and does not protect

Read this before trusting it with sensitive data.

| Layer | On matrix.org (interim) | On your self-hosted server (target) |
|---|---|---|
| **Message content** | Encrypted — the homeserver stores only ciphertext ✅ | You are the operator ✅ |
| **Metadata** (who talks to whom, when, how often, device list, room name/topic, your IP) | **Visible to matrix.org** ⚠️ | Contained ✅ |
| **The machine running Claudex** | Sees plaintext — Claude must read your messages to answer | Same |

- **The load-bearing control is cross-signing.** A malicious/compromised homeserver could try to inject a device — or swap your whole identity — to read "encrypted" messages. The sidecar defends on both sides: it **only decrypts messages from devices cross-signed by their owner** (an injected device's messages fail to decrypt and are ignored) and **only shares reply keys with cross-signed devices**. On top of that you **pin your cross-signing master key** (`MATRIX_TRUSTED_USER_KEYS`, Step 6), and the sidecar **enforces the pin fail-closed on the live data path**: if the server ever advertises a different master key for you, inbound messages from you are **dropped** and the bot **refuses to send** into that room (so an identity swap is caught, not just a device injection). This requires **cross-signing set up on your own account** (so your sending device is cross-signed); without that, E2EE on a managed homeserver gives little gain over Telegram.
- **E2EE protects content, not metadata.** matrix.org still sees who/when/how-much until you self-host. Keep the room **unfederated and membership-locked**, and keep the room name/topic uninformative.
- **The endpoint is always plaintext.** Harden the box running Claudex.

---

## Prerequisites

- **Claudex installed** — run `scripts/bootstrap.sh` first.
- **Python 3.10+** — runs the bridge (standard library only; no pip installs).
- **Rust toolchain** (`cargo`, stable) — to build the sidecar once. (Or use a prebuilt binary if your team publishes one internally.)
- **A Matrix account for the bot.** A **dedicated account** is recommended (cleanest verified-only semantics). You can use matrix.org now and migrate to a self-hosted homeserver later by changing one config value.

---

## Step 1: Build the sidecar

```bash
cd ~/.claude-agent/matrix-sidecar     # installed by bootstrap (source in repo: matrix-sidecar/)
cargo build --release
# binary: target/release/matrix-sidecar
```

> CI/deploy note: pin versions, commit `Cargo.lock`, and run `cargo audit`. The only crypto dependency is Element's `matrix-rust-sdk` (audited vodozemac); we add no cryptography of our own.

---

## Step 2: Log in and bootstrap crypto (one time)

```bash
~/.claude-agent/matrix-sidecar/target/release/matrix-sidecar login \
  --homeserver https://matrix.org \
  --user '@your-bot:matrix.org'
# Prompts for password (or SSO), then:
#   • stores an access token + device id + SQLite crypto store under ~/.claude-agent/data/matrix/ (0600)
#   • bootstraps the bot's cross-signing + Secure Backup
#   • prints the BOT device fingerprint  (you verify this in Step 5)
#   • reminds you to pin YOUR OWN cross-signing key (read from Element) in Step 6
```

The **access token lives in `~/.claude-agent/data/matrix/session.json`** (`0600`, created above) — it is *not* an `.env` var, and `serve` restores it from there. `login` prints the `MATRIX_HOMESERVER_URL` / `MATRIX_USER_ID` / `MATRIX_DEVICE_ID` lines to copy into `~/.claude-agent/.env`; you then add a random `MATRIX_SIDECAR_TOKEN` (e.g. `openssl rand -hex 32`) and, after Step 6, `MATRIX_TRUSTED_USER_KEYS`. Keep `.env` and `session.json` private.

---

## Step 3: Run the sidecar daemon

```bash
cp systemd/matrix-sidecar.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now matrix-sidecar
# verify (no secrets in this endpoint):
curl -s http://127.0.0.1:8765/health ; echo
# → {"ready":true,"synced":true,"crossSigningReady":true,"deviceId":"..."}
```

The sidecar binds **localhost only**. Its `/events` and `/send` endpoints carry decrypted plaintext and require the bearer token from `.env`; `/health` does not.

---

## Step 4: Create a room and invite the bot

> **Do Step 7 (access.json) first.** The sidecar **auto-joins an invite only if the inviting user is on `allowFrom`** (fail-closed). If you invite before the allowlist exists, the bot won't join — create access.json then `systemctl --user restart matrix-sidecar` to re-process the pending invite.

In Element (your normal account), create a **private, encrypted, unfederated** room and invite `@your-bot:matrix.org`. Encryption must be **on** — the sidecar refuses to operate in cleartext rooms. The bot **auto-joins** (gated by the allowlist). Keep the room name/topic uninformative.

---

## Step 5: Verify the bot's device (recommended)

In Element, verify the bot's device by **comparing its fingerprint** to what Step 2 printed (manual/QR device verification — the bot does **not** run an interactive emoji-SAS responder). This makes *your* client trust the bot's replies (no "unverified" shield) and lets you message it even with "only send to verified devices" enabled.

> This is a *your-side* trust step. The bot accepting and answering you does **not** depend on it — that's enforced at the protocol layer (the sidecar only decrypts/acts on messages from cross-signed devices). What you **do** need is cross-signing set up on your own account (your sending device cross-signed).

---

## Step 6: Pin your cross-signing key (critical)

Tell the sidecar to trust **only** your cross-signing identity, so an injected device can never receive keys:

```bash
# Use the cross-signing key printed in Step 2 (verify it out-of-band — e.g. read it from Element's
# "Security & Privacy" once — do not trust a key the server hands you unseen).
echo 'MATRIX_TRUSTED_USER_KEYS=@you:matrix.org=<your-cross-signing-key>' >> ~/.claude-agent/.env
systemctl --user restart matrix-sidecar
```

With this set, the sidecar shares room keys **only** with devices your pinned identity has cross-signed, and refuses others.

---

## Step 7: Lock down access (fail-closed allowlist) — do this BEFORE Step 4

The bridge **denies everyone** until you allowlist senders — it stays silent rather than answering strangers. The **sidecar also reads this file** to decide which inviters' rooms to auto-join, so create it *before* inviting the bot (Step 4).

```bash
mkdir -p ~/.claude/channels/matrix
cat > ~/.claude/channels/matrix/access.json <<'JSON'
{
  "policy": "allowlist",
  "allowFrom": ["@you:matrix.org"],
  "roomAllowFrom": []
}
JSON
chmod 600 ~/.claude/channels/matrix/access.json
```

- `policy` — `"allowlist"` (recommended) or `"open"` (answers any DM — risky).
- `allowFrom` — Matrix user IDs allowed to message the bot. `"*"` = anyone (not recommended).
- `roomAllowFrom` — room IDs the bot will respond in beyond a direct allowlisted sender. **Empty = closed** (safe default).

The bridge **re-reads this file on every message**, so edits take effect immediately — no restart.

---

## Step 8: Select the Matrix channel and start

```bash
# Make Matrix the default channel for this workspace:
mkdir -p ~/.claude-agent/data
echo matrix > ~/.claude-agent/data/channel

# Install the Matrix formatting rule:
cp rules/matrix.md ~/.claude-agent/.claude/rules/

# Start (manual / tmux):
CLAUDEX_CHANNEL=matrix bash ~/.claude-agent/scripts/start-claudex.sh
# Or via systemd: add  Environment=CLAUDEX_CHANNEL=matrix  to the claudex unit and restart.

# Check:
CLAUDEX_CHANNEL=matrix bash ~/.claude-agent/scripts/status-claudex.sh
```

---

## Step 9: Verify end to end

From your **verified** Element device, message the bot in the encrypted room. You should get a reply within a few seconds. Confirm the negative case too: an **unverified** device (or a non-allowlisted user) gets **no** reply.

---

## Configuration reference

Read by the sidecar and bridge from `~/.claude-agent/.env` (keep `0600`):

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `MATRIX_HOMESERVER_URL` | ✅ | — | e.g. `https://matrix.org`; change this to migrate to self-hosted |
| `MATRIX_USER_ID` | ✅ | — | the bot's Matrix ID, `@bot:server` |
| `MATRIX_SIDECAR_TOKEN` | ✅ | — | bearer token gating the localhost API; **you generate it** (e.g. `openssl rand -hex 32`) |
| `MATRIX_TRUSTED_USER_KEYS` | ✅ (security) | — | `@you:server=<cross-signing-key>`; pin to enforce verified-only |
| `MATRIX_DEVICE_ID` | | — | printed by `login` for reference; not read by the sidecar |
| `MATRIX_SIDECAR_PORT` | | `8765` | localhost port for the sidecar API |
| `CLAUDEX_CHANNEL` | | `telegram` | set to `matrix` to use this channel |
| `CLAUDEX_MODEL` | | `claude-opus-4-8` | model passed to `claude` |
| `MATRIX_ACCESS_FILE` | | `~/.claude/channels/matrix/access.json` | access policy |
| `MATRIX_MAX_MSG_LEN` | | `4000` | split longer replies |

> The **access token is not an `.env` var** — `matrix-sidecar login` stores the full session (token + device id) in `~/.claude-agent/data/matrix/session.json` (`0600`), and `serve` restores it from there.

---

## Migrating to a self-hosted homeserver (later)

1. Stand up Synapse/Conduit; create the bot account there; disable federation if you want maximum metadata containment.
2. Re-run `matrix-sidecar login --homeserver https://your.server` (new device → re-verify in Element, Steps 5–6).
3. Update `MATRIX_HOMESERVER_URL` (and `MATRIX_USER_ID`). No code changes.

This closes the metadata gap: the operator becomes you.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` not ready | Sidecar still syncing or login expired. `systemctl --user status matrix-sidecar`; check `~/.claude-agent/logs`. |
| Bot ignores messages | Sender not in `allowFrom`; or the room isn't encrypted; or the room id isn't allowlisted. |
| "Unable to decrypt" / no reply | Device not verified (Step 5) or your key not pinned (Step 6) — the sidecar won't share keys with unverified devices. |
| Replies look unformatted | Install `rules/matrix.md` so Claude uses Matrix-friendly formatting. |
| Lost crypto store | New device; re-run login and re-verify. Keep `~/.claude-agent/data/matrix/` in your backups (`0600`). |
