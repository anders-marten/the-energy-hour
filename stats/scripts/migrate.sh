#!/usr/bin/env bash
# Applies stats/migrations as energy_hour_owner, using credentials from the OpenTofu state.
# Run from anywhere after `deploy/tofu.py apply`; every migration is safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CA="$(mktemp)"
trap 'rm -f "$CA"' EXIT
python3 "$ROOT/deploy/tofu.py" output -raw stats_database_ca > "$CA"
OWNER_URL="$(python3 "$ROOT/deploy/tofu.py" output -raw stats_owner_database_url)"
for file in "$ROOT"/stats/migrations/*.sql; do
  echo "Applying $(basename "$file")"
  PGSSLROOTCERT="$CA" psql "$OWNER_URL" -q -v ON_ERROR_STOP=1 -v app_role=energy_hour_app -f "$file"
done
