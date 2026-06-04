#!/usr/bin/env bash
# Stop the local test Synapse and wipe ALL of its data (config, keys, database).
set -euo pipefail
cd "$(dirname "$0")"

docker compose down -v
rm -rf ./data
echo "✅ Synapse stopped and ./data wiped"
