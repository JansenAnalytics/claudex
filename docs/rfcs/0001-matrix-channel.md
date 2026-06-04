# RFC 0001 — Matrix channel (encrypted communication)

| | |
|---|---|
| **Status** | Draft — for in-house review / sign-off |
| **Author** | Claudex maintainers |
| **Created** | 2026-05-31 |
| **Branch** | `feat/matrix-channel` (off `main`) |
| **Supersedes** | — |
| **Scope** | Add Matrix as a communication channel for the Claudex agent, with end-to-end encryption. Telegram remains the default and is unchanged. |

---

## 1. Summary

Add **Matrix** as a first-class communication channel for the Claudex agent, alongside the existing Telegram channel. Matrix is selected for **end-to-end encrypted (E2EE)** communication suitable for sensitive data.

The integration is **two processes** we run locally:

1. **`matrix-sidecar`** — a small **Rust** daemon built on the Element-maintained [`matrix-rust-sdk`](https://github.com/matrix-org/matrix-rust-sdk). It owns *all* cryptography: login, persistent SQLite crypto/state store, sync, cross-signing, and **verified-devices-only** message delivery. It exposes a minimal **localhost-only HTTP API** (decrypted inbound events out, plaintext send requests in). It is a dedicated transport daemon, keeping all cryptography out of the bridge.
2. **`matrix-bridge.py`** — a **Python** resident process (the team's language) that contains all business logic: access allowlist, per-room Claude session continuity, invoking `claude -p`, reply formatting, and watchdog integration. It speaks only to the sidecar over localhost and has **no third-party dependencies** (Python standard library only).

This split keeps the irreducible cryptography in the one SDK that meets our security bar, while putting the frequently-changed logic in a language the team maintains comfortably.

---

## 2. Motivation

- The current Telegram channel uses the **Bot API**, which is **not** end-to-end encrypted — Telegram's servers (and the bot intermediary) see message plaintext. For a cooperation handling sensitive data, that places the platform operator inside the content trust boundary.
- Matrix with E2EE removes the platform operator from the *content* boundary: the homeserver stores only ciphertext.
- We will start on a **managed homeserver (matrix.org)** and migrate to a **self-hosted** homeserver mid-term. The design makes the homeserver a single config value so that migration is config-only.

See §4 for the precise security model, including what this does and does **not** protect.

---

## 3. Goals / Non-goals

**Goals**
- E2EE direct-message channel between an allowlisted human and the agent.
- **Verified-devices-only**: never share keys with, or accept content from, devices not cross-signed by their owner. This is the control that makes a *managed* homeserver acceptable.
- Persistence across restarts (the agent is watchdog-restarted): stable device identity and keys.
- No hand-rolled cryptography; no new attack surface in our own code beyond a thin, auditable layer.
- Reuse the existing channel tooling (start/stop/status/watchdog) via a channel-selection seam. Telegram behaviour unchanged.

**Non-goals (v1)**
- Group/multi-room support (DM / single locked room first; rooms allowlist is scaffolded but defaults closed).
- Inbound attachment download (annotated for Claude, not fetched — a deliberate v1 limitation).
- Metadata-hiding beyond what self-hosting later provides (see §4).
- Migrating the Telegram channel.

---

## 4. Security model (read before sign-off)

E2EE protects **message content** against the homeserver operator. It does **not** hide metadata, and it does **not** protect the endpoint. Concretely:

| Layer | matrix.org (interim) | Self-hosted (target) |
|---|---|---|
| **Message content** | Ciphertext only — operator cannot read ✅ | Operator is you ✅ |
| **Metadata** (who/when/volume, device list, room name/topic, IP) | Visible to matrix.org ⚠️ | Contained ✅ |
| **Endpoint** (the box running Claudex) | Sees plaintext — unavoidable, Claude must read messages | Same |

**Threat model and the load-bearing control.** On a managed homeserver the realistic attack is the operator (or anyone who compromises it) **injecting a device** for the human, or issuing a malicious key request, to receive Megolm keys and read "encrypted" traffic. The defence is **cross-signing-based verified-only delivery**: the sidecar shares room keys *only* with devices cross-signed by their owner, and the human's cross-signing identity is **pinned** (verified out-of-band once). A rogue device the operator adds is not cross-signed → it never receives keys. **Symmetrically, inbound is gated at decryption:** `TrustRequirement::CrossSigned` means the bot only decrypts — and therefore only acts on — messages from cross-signed sender devices; an injected device's messages fail to decrypt and are never processed (the bridge never sees them). The bot deliberately runs **no interactive SAS verifier** (a bot auto-confirming SAS would itself be a trust smell); the human establishes trust in the bot by comparing its printed device fingerprint. Without this control, E2EE on a managed homeserver gives little assurance over Telegram. It is therefore **mandatory in v1**, not optional.

This also mitigates the disputed Feb-2026 vodozemac finding (all-zero X25519 in Olm 3DH): Matrix's response notes the attack is prevented by authenticated, verified key distribution — exactly the posture we enforce — and a defence-in-depth fix is landing upstream. We track and bump.

**Residual risks (documented, accepted, or mitigated):**
- Metadata exposure on matrix.org until self-hosting. Mitigation: keep the room **unfederated and membership-locked**; minimise room name/topic.
- Endpoint plaintext: out of scope for E2EE; mitigated by host hardening (existing harness posture).
- Loss of the crypto store ⇒ new device ⇒ re-verification required. Mitigation: persistent SQLite store at `0600`, included in backups; documented recovery.

---

## 5. Why this architecture (decision record)

We evaluated every realistic way to get **{persistent on the server host + verified-only via cross-signing + modern vodozemac crypto}** and found that *no single library* provides all three except the Rust SDK:

| Option | Persistent | Verified-only | Modern crypto | Verdict |
|---|---|---|---|---|
| `matrix-js-sdk` (Node, WASM crypto) | ❌ ephemeral on Node ([#4769](https://github.com/matrix-org/matrix-js-sdk/issues/4769)) | ✅ isolation mode | ✅ vodozemac | Rejected — loses keys every restart |
| `matrix-bot-sdk` (Node) | ✅ | ❌ no cross-signing (open since 2021) | ✅ | Rejected — can't enforce verified-only |
| Native `OlmMachine` binding + our own sync | ✅ | ✅ | ✅ | Rejected — we'd hand-write E2EE orchestration (highest risk) |
| Python `matrix-nio` / `mautrix-python` | ✅ | ❌ libolm + weak/no cross-signing | ❌ libolm (deprecated, 2024 CVEs) | Rejected — fails crypto + verified-only bar |
| Python `vodozemac` primitives + own client | ✅ | (build it) | ✅ | Rejected — hand-rolled crypto, forbidden by mandate |
| **`matrix-rust-sdk` (Rust)** | ✅ SQLite | ✅ full cross-signing | ✅ vodozemac | **Chosen** — only option meeting all three; Element-maintained; backs Element X, Fractal, iamb; audited crypto |
| Pantalaimon proxy | ✅ | ⚠️ weak | ❌ libolm (deprecated, inactive) | Rejected earlier |

**Resolution of the language question.** The team prefers Python and there is *no official Element Python SDK* (official SDKs are Rust and JS); the mature Python clients are libolm-based with weak cross-signing. Rather than compromise crypto, we **split by change-frequency**: crypto stays in a thin, write-once Rust sidecar on `matrix-rust-sdk`; all logic the team iterates on lives in Python. The team owns ~90% of the evolving code; Rust covers only the crypto core no Python library can safely provide today.

---

## 6. Architecture

```
Your phone (Element, verified) ──E2EE──> Homeserver (matrix.org → self-hosted)
                                              │  (ciphertext + metadata)
                                              ▼
   ┌───────────────────────────── your machine ─────────────────────────────┐
   │  matrix-sidecar (Rust, matrix-rust-sdk)        systemd: matrix-sidecar  │
   │   • SQLite crypto+state store (0600, persistent)                        │
   │   • cross-signing; verified-devices-only send/receive                   │
   │   • refuses non-encrypted rooms; ignores own messages                   │
   │   • localhost HTTP API (token-gated):                                   │
   │        GET /health   GET /events (SSE)   POST /send                      │
   │                         │  decrypted events ▲ │ plaintext send          │
   │                         ▼                    │                           │
   │  matrix-bridge.py (Python stdlib, resident — tmux/systemd)              │
   │   • access allowlist (fail-closed, re-read per msg)                     │
   │   • per-room Claude session → claude -p <text> --resume <sid>           │
   │   • format reply, POST /send; watchdog inbox backlog files              │
   │                         │  argv (no shell)                               │
   │                         ▼                                                │
   │  claude (headless, --dangerously-skip-permissions, OAuth)               │
   └─────────────────────────────────────────────────────────────────────────┘
```

Two of our processes (sidecar + bridge) plus the `claude` subprocess — a transport daemon, the bridge, and the `claude` subprocess.

---

## 7. Sidecar ↔ bridge interface contract

Localhost only. The sidecar binds `127.0.0.1:${MATRIX_SIDECAR_PORT:-8765}`. Because the `/events` stream and `/send` body carry **decrypted plaintext**, all endpoints except `/health` require `Authorization: Bearer ${MATRIX_SIDECAR_TOKEN}` (random, stored in `~/.claude-agent/.env`, `0600`) so other local users/processes cannot read the decrypted stream.

- `GET /health` → `200 {"ready":bool,"synced":bool,"crossSigningReady":bool,"deviceId":"..."}` (no secrets; used by the watchdog/status). Non-ready ⇒ non-2xx.
- `GET /events` → `text/event-stream`; one `data:` JSON object per decrypted, content-bearing inbound message:
  `{"type":"message","room_id":"!..","event_id":"$..","sender":"@u:server","sender_verified":bool,"body":"..","formatted_body":null,"ts":<ms>,"encrypted":true}`.
  Receipts/typing/reactions/own-messages are filtered out by the sidecar.
- `POST /send` `{"room_id":"!..","body":"..","formatted_body":null}` → `200 {"event_id":"$.."}`. The sidecar sends **encrypted, verified-only**; it returns a 4xx if the room is not encrypted or has no eligible (cross-signed) device to deliver to, so the bridge can surface/log it.

It's a minimal health / events / send surface, so the watchdog and status tooling treat Matrix exactly like Telegram.

---

## 8. Components

**8.1 `matrix-sidecar` (Rust).** Responsibilities only — no business logic:
- Login via access token + device id from `.env` (created by a one-time `matrix-login` step); persist session + crypto in a SQLite store under `~/.claude-agent/data/matrix/` (`0600`).
- Bootstrap the bot's own cross-signing + Secure Backup; expose the bot device fingerprint for one-time human verification.
- Enforce **verified-only**: configure room-key sharing to cross-signed devices only; pin the human's cross-signing key(s) from config (`MATRIX_TRUSTED_USER_KEYS`); refuse to operate in non-encrypted rooms.
- Run the sync loop; emit decrypted, content-bearing inbound events on `/events`; accept `/send`.
- Structured logs with identifiers redacted; never log message bodies.

**8.2 `matrix-bridge.py` (Python, stdlib only).** The bridge:
- Consume `/events`; **de-dupe** by `event_id`.
- **Access gate** `~/.claude/channels/matrix/access.json` `{policy, allowFrom:[@user:server], roomAllowFrom:[!room:server]}`; **fail-closed** (missing/invalid ⇒ nothing allowed); re-read per message; groups/rooms disabled unless explicitly listed; ignore self.
- **Per-room serial queue** (ordered within a room for `--resume`; concurrent across rooms).
- **Per-room Claude session** persisted to `data/matrix-sessions.json` (`0600`) → `claude -p <body> --output-format json --dangerously-skip-permissions [--model M] [--resume SID]`, spawned **without a shell** (body is a single argv element), `ANTHROPIC_API_KEY` removed from the child env.
- Format reply (Matrix renders markdown/HTML), split if needed, `POST /send`.
- **Watchdog integration**: write an inbox backlog file on receipt, delete on successful delivery, leave on failure — the same inbox-backlog mechanism the watchdog already uses, so it detects a wedged channel.
- Redacted structured logging; no message bodies.

**8.3 Channel seam.** New `scripts/channel-config.sh` resolves `CLAUDEX_CHANNEL` (`telegram` default → `matrix`) and exports `CH_NAME/CH_INBOX/CH_ACCESS/CH_PROC_MATCH/CH_TRANSPORT_MATCH` + `channel_launch_cmd/channel_transport_healthy/channel_active_work`. `start/stop/status/watchdog/session-init` source it; **Telegram behaviour is byte-for-byte preserved** (default arm). Matrix arm: launch `python3 matrix-bridge.py`; transport health = `curl /health`; active-work = `pgrep -f "claude -p"`.

**8.4 systemd.** `matrix-sidecar.service` runs the Rust daemon (its own user unit, `EnvironmentFile=~/.claude-agent/.env`, localhost). The bridge is the resident process under the existing `claudex` service/tmux. Stopping Claudex does **not** stop the sidecar (separately managed); the watchdog logs (does not restart) on transient sidecar unavailability, since it reconnects.

---

## 9. Dependency vetting

- **Rust sidecar:** `matrix-rust-sdk` (Element-maintained, production, audited vodozemac). Pin exact versions; commit `Cargo.lock`; run `cargo audit` in CI; review the crate tree; enable only required SDK features (no calls/RTC). The crypto core is the audited vodozemac.
- **Python bridge:** **standard library only** — no pip dependencies (a deliberate zero-dependency stance). Nothing to audit beyond CPython itself.
- No code we write performs cryptography.

---

## 10. Testing

- **Python bridge** (runnable in CI and locally): unit tests for the pure helpers (access policy, formatting, session store, argv construction — incl. an explicit command-injection test) + an **integration test** against a **mock sidecar** (in-process HTTP server emitting `/events` and recording `/send`) and a **fake `claude`** binary, exercising receive → authorize → claude → send, de-dupe, fail-closed denial, per-room continuity, long-reply split, and backlog-on-failure.
- **Channel seam**: `tests/channel-config.test.sh` asserts default/telegram/matrix resolution and the exported vars/functions.
- **Rust sidecar**: `cargo test` for parsing/config; **manual E2EE acceptance** (verify a real encrypted round-trip with a verified Element device, and confirm an *unverified* device is refused). Crypto correctness is delegated to the audited SDK and not re-tested.
- We do **not** mock E2EE in the bridge tests — the bridge never sees ciphertext; the sidecar owns crypto.

---

## 11. Rollout

- **Phase 1 (matrix.org):** sidecar + bridge + channel seam + login helper + verified-only + key pinning + DM/single locked room. Tests green. Self-hosting deferred.
- **Phase 2:** rooms allowlist + formatting polish.
- **Phase 3 (self-host):** set `MATRIX_HOMESERVER_URL` to your Synapse/Conduit — **config-only**; disable federation + lock membership to close the metadata gap.

---

## 11a. Known limitations (v1)

- **Bridge-downtime message loss.** The sidecar decrypts inbound and pushes it to a live broadcast to the bridge's `/events` subscription; events are **not buffered/replayed**. If the bridge is *down* exactly when a message arrives (e.g. mid-restart), that message is dropped — no reply. The window is small (the watchdog restarts the bridge in seconds) and processing of a message in flight does not block the reader, but it is real. Mitigation if needed later: have the sidecar persist undelivered events (reuse the inbox dir) and replay on `/events` (re)connect. Telegram has a comparable gap.
- **Single verified human.** v1 is scoped to DM / one locked room with one allowlisted, cross-signed user; group/multi-user verified semantics are out of scope.
- **Auto-join is allowlist-gated, not identity-pinned.** The bot auto-joins invites from `allowFrom` users; the cross-signing **pin** (`MATRIX_TRUSTED_USER_KEYS`) governs key sharing, not the join decision.

## 12. Open questions for reviewers

1. **Sidecar transport:** localhost HTTP+SSE (specified here) vs. stdio JSON-lines (no port). HTTP chosen for watchdog/status symmetry; confirm acceptable.
2. **Login method:** access-token (recommended; created once via `matrix-login`) vs. password-in-`.env`. RFC assumes access-token.
3. **Bot identity:** dedicated bot account vs. a linked device of the human's account. RFC assumes a dedicated account (cleaner verified-only semantics).
4. **Build/deploy:** introduces a Rust build (cargo) into CI/deploy. Confirm toolchain availability and patching ownership.
5. **Key-pin bootstrap:** pin the human cross-signing key explicitly in config (stronger) vs. trust-on-first-use with alert-on-change. RFC recommends explicit pinning.
