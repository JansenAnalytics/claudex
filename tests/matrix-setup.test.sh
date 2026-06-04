#!/bin/bash
# tests/matrix-setup.test.sh — assertions for the secret-safe .env upsert helper
# in scripts/matrix-setup.sh. Run: bash tests/matrix-setup.test.sh
#
# Sources the installer in library-only mode (MATRIX_SETUP_LIB_ONLY=1) so only the
# helpers are defined — the installer body never runs and nothing is installed.

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/scripts/matrix-setup.sh"

TMPWS="$(mktemp -d)"
trap 'rm -rf "$TMPWS"' EXIT
export CLAUDEX_WORKSPACE="$TMPWS"
export MATRIX_SETUP_LIB_ONLY=1
# shellcheck source=/dev/null
source "$SCRIPT"
set +e  # the installer sets -e; tests assert on return codes

# Define test helpers AFTER sourcing so they shadow matrix-setup's own ok()/say().
PASS=0; FAIL=0
ok() { echo "ok   - $1"; PASS=$((PASS + 1)); }
no() { echo "FAIL - $1"; FAIL=$((FAIL + 1)); }
assert_eq()  { if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (expected '$2', got '$1')"; fi; }
assert_yes() { if "$@"; then ok "$*"; else no "$* (expected success)"; fi; }
assert_no()  { if "$@"; then no "$* (expected failure)"; else ok "$* → false"; fi; }

# ── Seed unrelated keys (must survive an upsert) ──────────────────────────────
printf 'OPENAI_API_KEY=sk-test-123\nCLAUDEX_EMBEDDING_PROVIDER=ollama\n' > "$TMPWS/.env"

# ── Insert a new key ──────────────────────────────────────────────────────────
env_upsert MATRIX_SIDECAR_TOKEN deadbeef >/dev/null
assert_eq "$(env_get MATRIX_SIDECAR_TOKEN)" "deadbeef" "insert new key"
assert_eq "$(env_get OPENAI_API_KEY)" "sk-test-123" "unrelated key preserved (1)"
assert_eq "$(env_get CLAUDEX_EMBEDDING_PROVIDER)" "ollama" "unrelated key preserved (2)"

# ── Replace an existing key in place (no duplicates) ──────────────────────────
env_upsert MATRIX_SIDECAR_TOKEN cafef00d >/dev/null
assert_eq "$(env_get MATRIX_SIDECAR_TOKEN)" "cafef00d" "replace existing key value"
assert_eq "$(grep -c '^MATRIX_SIDECAR_TOKEN=' "$TMPWS/.env")" "1" "no duplicate key lines"
assert_eq "$(env_get OPENAI_API_KEY)" "sk-test-123" "unrelated key still preserved after replace"

# ── Values containing '=' and ':' (the trusted-key pin format) round-trip ─────
env_upsert MATRIX_TRUSTED_USER_KEYS "@you:server=AbC+/d3f=" >/dev/null
assert_eq "$(env_get MATRIX_TRUSTED_USER_KEYS)" "@you:server=AbC+/d3f=" "value with = and : round-trips"

# ── env_has presence semantics ────────────────────────────────────────────────
assert_yes env_has MATRIX_SIDECAR_TOKEN
assert_no  env_has DOES_NOT_EXIST

# ── .env stays 0600 ───────────────────────────────────────────────────────────
PERM="$(stat -c '%a' "$TMPWS/.env" 2>/dev/null || stat -f '%Lp' "$TMPWS/.env" 2>/dev/null)"
assert_eq "$PERM" "600" ".env permissions are 0600"

echo "----"
echo "matrix-setup: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
