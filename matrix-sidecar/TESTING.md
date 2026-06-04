# Testing the matrix-sidecar

E2EE correctness can't be proven by unit tests alone — you validate your
*configuration* of an audited library (matrix-rust-sdk / vodozemac) through
acceptance testing against a real homeserver. So testing is layered:

## 0. Test environments

The acceptance pass (§2) needs a real homeserver, a bot account, your account, and
a deliberately-unverified second session. Two options:

- **matrix.org (primary).** Register one extra free account for the bot
  (`@…-bot:matrix.org`); your existing account is the allowlisted user. This
  covers **7 of 8** scenarios. It does **not** give homeserver-admin, so the
  literal device-injection (#3) can't be run — but #2 (an unverified second
  session) exercises the **identical** key-sharing defense, so coverage of the
  verified-only property is effectively complete. Caveats: shared production
  server (rate limits, no reset); **use throwaway test messages, never real data**.
- **Local Synapse (for #3 + CI):** `test-harness/` spins up a disposable
  homeserver **with admin** in one command (`./setup.sh`), so you can do the
  literal device injection/inspection and reset between runs. See
  [`test-harness/README.md`](test-harness/README.md).

Recommended: run §2 on **matrix.org** for the main sign-off, and use the local
Synapse harness for scenario #3 and reproducible/CI runs.

## 1. Unit tests (`cargo test`, in CI)

Cover the pure logic that is ours to get right:

- **`config.rs`** — env parsing: defaults, required-var errors, port override + fallback, workspace/store paths, trusted-key parsing.
- **`server.rs`** — bearer auth (`bearer_matches`, constant-time `ct_eq`: exact-token-only, scheme case-sensitivity, missing header) and `/send` request deserialization (incl. optional `formatted_body`).
- **`matrix.rs`** — the `should_forward` predicate (joined ∧ encrypted ∧ non-empty ∧ not-self) and the **cross-language contract** test asserting `InboundMsg` serializes to exactly the JSON `scripts/matrix-bridge.py::parse_event` consumes (mirrored by the Python test `test_sidecar_contract_payload`).

Run: `cargo test`. Also gated in CI: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo audit`.

> Not unit-tested (by nature): the matrix-rust-sdk calls themselves — session
> persistence, sync, cross-signing, and key-sharing. Crypto correctness is the
> SDK's; what we must verify is that we *configured* it correctly (below).

## 2. E2EE acceptance test (manual gate — REQUIRED before production)

Do this once on a staging homeserver after `cargo build --release`. It proves
the security-critical properties that unit tests cannot.

Setup (on matrix.org or the local harness — see §0): `matrix-sidecar login …`;
run `serve`; verify the bot device in Element; pin your cross-signing key via
`MATRIX_TRUSTED_USER_KEYS`; allowlist your user.

| # | Test | Expected |
|---|------|----------|
| 1 | From your **verified** Element device, message the encrypted room | Reply within seconds; `/events` emitted `sender_verified:true` |
| 2 | **Unverified** session: log a second device into your account but do **not** cross-sign/verify it; message from it | Bridge does **not** act (`sender_verified:false` → denied); sidecar does **not** share keys with it |
| 3 | **Injected device** (local Synapse + admin API; on matrix.org this is covered in substance by #2): inject/inspect a device for your user and confirm the bot won't send it room keys | No key shared to a non-cross-signed device |
| 4 | **Non-allowlisted** user messages the bot | No reply (fail-closed allowlist) |
| 5 | **Cleartext** (unencrypted) room | Bridge/sidecar refuse to operate; `/send` returns non-2xx |
| 6 | **Key-pin mismatch**: set `MATRIX_TRUSTED_USER_KEYS` to a wrong key, restart | Sidecar logs the mismatch and refuses to trust that identity |
| 7 | **Restart persistence**: `systemctl --user restart matrix-sidecar` | Same `device_id`; existing sessions resume; no re-verification needed |
| 8 | **Token gate**: `curl /events` and `/send` without the bearer token | `401`; `/health` still `200` |

Record the run (date, homeserver, sidecar version, matrix-sdk version) in the PR.

## 3. Optional: automated integration test

For continuous E2EE coverage, drive the built binary against an ephemeral
homeserver (Synapse/Conduit container) with a second `matrix-rust-sdk` test
client acting as the verified/unverified user, asserting tests 1–8. Heavier to
maintain and version-sensitive — the manual gate (§2) is the minimum bar.
