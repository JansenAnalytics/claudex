#!/usr/bin/env bash
# Bring up a throwaway local Synapse and register the test accounts used by the
# Matrix acceptance plan (see ../TESTING.md). LOCAL ONLY — open registration +
# a known shared secret, bound to 127.0.0.1.
#
# Prereqs: Docker (with the `docker compose` plugin) and curl. `jq` is optional
# (only for the admin-API examples printed at the end).
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose"
DATA="./data"
HS="http://localhost:8008"
SHARED_SECRET="test-shared-secret-local-only"   # LOCAL TEST ONLY

mkdir -p "$DATA"

# 1. Generate Synapse config + signing keys on first run, then patch in
#    test-only settings (open registration, known secret, relaxed rate limits,
#    no federation). Appended once; re-running setup.sh reuses the config.
if [ ! -f "$DATA/homeserver.yaml" ]; then
    echo "▸ Generating Synapse config (first run)..."
    $COMPOSE run --rm synapse generate
    cat >> "$DATA/homeserver.yaml" <<YAML

# ─── Claudex test-harness overrides (LOCAL THROWAWAY ONLY) ──────────────────
enable_registration: true
enable_registration_without_verification: true
registration_shared_secret: "$SHARED_SECRET"
rc_message:
  per_second: 1000
  burst_count: 1000
rc_login:
  address: { per_second: 1000, burst_count: 1000 }
  account: { per_second: 1000, burst_count: 1000 }
  failed_attempts: { per_second: 1000, burst_count: 1000 }
federation_domain_whitelist: []   # sealed: no federation
YAML
    echo "  ✅ config generated + patched"
    echo "  (if Synapse later complains about a duplicate key, the base config"
    echo "   already set it — remove the duplicate from $DATA/homeserver.yaml)"
fi

# 2. Start.
echo "▸ Starting Synapse..."
$COMPOSE up -d

# 3. Wait for readiness (host-side; no in-container tools assumed).
printf "▸ Waiting for homeserver"
for i in $(seq 1 60); do
    if curl -fsS "$HS/_matrix/client/versions" >/dev/null 2>&1; then echo " — up"; break; fi
    printf "."; sleep 2
    if [ "$i" = 60 ]; then echo " timeout"; exit 1; fi
done

# 4. Register accounts (idempotent: ignores "already exists").
reg() {
    local user="$1" pass="$2" admin_flag="${3:-}"
    # shellcheck disable=SC2086
    $COMPOSE exec -T synapse register_new_matrix_user \
        -u "$user" -p "$pass" $admin_flag \
        -c /data/homeserver.yaml "$HS" 2>&1 | sed 's/^/    /' || true
}
echo "▸ Registering accounts..."
reg claudex-bot botpass
reg you youpass
reg stranger strangerpass
reg admin adminpass --admin

cat <<EOF

✅ Local Synapse ready at $HS  (server_name: localhost)

   Accounts (user / password):
     @claudex-bot:localhost / botpass      ← the sidecar's account
     @you:localhost         / youpass      ← allowlisted human (verify + pin)
     @stranger:localhost    / strangerpass ← non-allowlisted (scenario 4)
     @admin:localhost       / adminpass    ← admin (scenario 3: device inject/inspect)

Next:
  1. Point Element at $HS, log in as @you, enable Secure Backup/cross-signing,
     create an ENCRYPTED room, and invite @claudex-bot:localhost.
  2. Log the sidecar in against this server:
       MATRIX_LOGIN_PASSWORD=botpass \\
         ../target/release/matrix-sidecar login \\
         --homeserver $HS --user @claudex-bot:localhost
  3. Fill ~/.claude-agent/.env (MATRIX_*, a random MATRIX_SIDECAR_TOKEN, and
     MATRIX_TRUSTED_USER_KEYS=@you:localhost=<your cross-signing key>), then
     run \`matrix-sidecar serve\`. Allowlist @you in access.json.
  4. Work through ../TESTING.md §2.

Scenario 3 (admin device inject/inspect), needs \`jq\`:
  TOKEN=\$(curl -s -XPOST $HS/_matrix/client/v3/login \\
    -d '{"type":"m.login.password","identifier":{"type":"m.id.user","user":"admin"},"password":"adminpass"}' \\
    | jq -r .access_token)
  curl -s -H "Authorization: Bearer \$TOKEN" \\
    $HS/_synapse/admin/v2/users/@you:localhost/devices | jq

Teardown (stops + wipes all data):  ./teardown.sh
EOF
