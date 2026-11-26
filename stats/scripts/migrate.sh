#!/usr/bin/env bash
# Applies new files in stats/migrations as the database owner, each in its own
# transaction, and records them in energy_hour.schema_migrations.
#
# CI sets STATS_OWNER_DATABASE_URL (and PGSSLROOTCERT for production). Run
# locally without it, the owner URL and CA are read from the OpenTofu state.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_ROLE="${STATS_APP_ROLE:-energy_hour_app}"

if [ -z "${STATS_OWNER_DATABASE_URL:-}" ]; then
  CA="$(mktemp)"
  trap 'rm -f "$CA"' EXIT
  python3 "$ROOT/deploy/tofu.py" output -raw stats_database_ca > "$CA"
  export PGSSLROOTCERT="$CA"
  STATS_OWNER_DATABASE_URL="$(python3 "$ROOT/deploy/tofu.py" output -raw stats_owner_database_url)"
fi

run_psql() {
  psql "$STATS_OWNER_DATABASE_URL" -q -X -v ON_ERROR_STOP=1 -v app_role="$APP_ROLE" "$@"
}

run_psql -c "CREATE SCHEMA IF NOT EXISTS energy_hour" \
  -c "CREATE TABLE IF NOT EXISTS energy_hour.schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"

applied="$(run_psql -At -c "SELECT filename FROM energy_hour.schema_migrations")"
for file in "$ROOT"/stats/migrations/*.sql; do
  name="$(basename "$file")"
  if grep -qxF "$name" <<<"$applied"; then
    echo "Already applied: $name"
    continue
  fi
  echo "Applying: $name"
  # The migration and its record commit together, or not at all.
  run_psql --single-transaction -f "$file" \
    -c "INSERT INTO energy_hour.schema_migrations (filename) VALUES ('$name')"
done
