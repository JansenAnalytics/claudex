# matrix-sidecar test harness — throwaway local Synapse

A one-command, disposable Matrix homeserver for acceptance-testing the Matrix
channel **with admin access** — used for scenario #3 (device injection/inspection)
and for repeatable/CI runs. For the primary acceptance pass you can also just use
**matrix.org** (covers 7/8 scenarios); see [`../TESTING.md`](../TESTING.md) §0.

> ⚠️ **Local throwaway only.** `setup.sh` enables open registration and a known
> shared secret so accounts and devices can be created freely. It binds to
> `127.0.0.1`. Never expose it; never put real/corporate data on it.

## Prerequisites
- Docker with the `docker compose` plugin
- `curl` (readiness probe); `jq` optional (admin-API examples)

## Quickstart
```bash
cd matrix-sidecar/test-harness
./setup.sh        # starts Synapse on http://localhost:8008 + registers accounts
# ... run the sidecar against it and work through ../TESTING.md §2 ...
./teardown.sh     # stops Synapse and wipes ./data
```

`setup.sh` prints the accounts it creates (`@claudex-bot`, `@you`, `@stranger`,
`@admin`), the sidecar `login` command pointed at the local server, and the
admin-API snippet for inspecting/injecting devices.

## What this gives you over matrix.org
| | matrix.org | local Synapse (this harness) |
|---|---|---|
| Scenarios 1,2,4,5,6,7,8 | ✅ | ✅ |
| #3 literal device injection (admin API) | ❌ no admin | ✅ |
| Reset between runs / CI reproducibility | ❌ | ✅ |
| Real/corporate data | ❌ never | ❌ never (throwaway) |

## Files
- `docker-compose.yml` — single Synapse container (SQLite), localhost:8008.
- `setup.sh` — generate config (first run) + patch test settings + start + register accounts.
- `teardown.sh` — `docker compose down -v` + wipe `./data`.
- `data/` — generated config, signing keys, DB (git-ignored; created at runtime).

## Notes
- First `setup.sh` run pulls the Synapse image and generates signing keys (~1 min).
- `server_name` is `localhost`, so ids look like `@you:localhost`. Element accepts
  `http://localhost:8008` as a custom homeserver for local dev.
- This harness exercises *our* configuration (verified-only sharing, pinning,
  cleartext refusal) end-to-end; vodozemac/matrix-rust-sdk crypto correctness is
  the SDK's own (audited) responsibility.
