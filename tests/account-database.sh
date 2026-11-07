#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
db_container="apex-account-test-$$"
trap 'docker rm -f "$db_container" >/dev/null 2>&1 || true' EXIT
docker run --name "$db_container" --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust -d postgres:17-alpine >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [ "$attempt" = 30 ]; then echo 'PostgreSQL did not become ready'; exit 1; fi
  sleep 1
done
docker exec "$db_container" mkdir -p /work
docker cp supabase "$db_container":/work/supabase
docker cp tests/account-database.sql "$db_container":/work/account-database.sql
docker exec "$db_container" psql -U postgres -f /work/account-database.sql
