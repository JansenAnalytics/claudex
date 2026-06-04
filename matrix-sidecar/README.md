# matrix-sidecar

The E2EE transport for the Claudex Matrix channel: a small local daemon that owns
**all** cryptography, persistence, cross-signing, and **verified-devices-only**
delivery — built on Element's
audited [`matrix-rust-sdk`](https://github.com/matrix-org/matrix-rust-sdk)
(vodozemac). The Python bridge (`scripts/matrix-bridge.py`) drives it over a
localhost-only HTTP API and never touches cryptography.

See [`../docs/rfcs/0001-matrix-channel.md`](../docs/rfcs/0001-matrix-channel.md)
and [`../docs/matrix-setup.md`](../docs/matrix-setup.md).

## Build

```bash
cargo build --release      # binary: target/release/matrix-sidecar
cargo test
cargo audit                # vet the dependency tree (CI)
```

> The crate pins `matrix-sdk` for reproducibility. On first build, `cargo update`
> to the latest release, confirm the API still matches (the version-sensitive
> calls are flagged with `// VERIFY:` in `src/matrix.rs` — most importantly the
> **verified-only key-sharing strategy**, the security-critical setting), then
> commit `Cargo.lock`.

## Use

```bash
# One-time login (writes session + bootstraps cross-signing, prints the bot
# device fingerprint to verify in Element):
matrix-sidecar login --homeserver https://matrix.org --user @bot:matrix.org

# Run the daemon (driven by the systemd unit in ../systemd/matrix-sidecar.service):
matrix-sidecar serve
```

Configuration is read from the environment / `~/.claude-agent/.env` — see
`src/config.rs` and the setup guide.

## HTTP contract (localhost only)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{ready,synced,crossSigningReady,deviceId}` |
| GET | `/events` | Bearer | SSE; one `data:` JSON per decrypted message: `{type:"message",room_id,event_id,sender,sender_verified,body,ts}` |
| POST | `/send` | Bearer | `{room_id,body,formatted_body}` → `{event_id}`; encrypted, verified-only; 4xx if the room is not encrypted |

Bearer token = `MATRIX_SIDECAR_TOKEN`. Binds `127.0.0.1:${MATRIX_SIDECAR_PORT:-8765}`.

## Security notes

- Verified-only delivery (cross-signing) is enforced in `src/matrix.rs` via the
  SDK's key-sharing strategy; the human's cross-signing identity is pinned via
  `MATRIX_TRUSTED_USER_KEYS`. This is the control that makes a managed homeserver
  acceptable — review it carefully.
- The store (private keys) lives under `~/.claude-agent/data/matrix/` and must be
  `0700`/`0600`. The session file and `.env` are credentials.
- Bind localhost only; `/events` and `/send` carry decrypted plaintext and are
  bearer-gated so other local processes cannot read the stream.
