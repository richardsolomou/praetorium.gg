#!/usr/bin/env bash
# The production container against a real Postgres and Valkey, on a network of
# their own.
#
# Playwright runs this as its web server and kills it when the suite ends, so
# everything it creates is torn down on the way out — including on failure, which
# is when a stray container is most likely and most confusing.
set -euo pipefail

port=${1:?port required}
image=${PLAYWRIGHT_IMAGE:-praetorium-e2e}
root=${PLAYWRIGHT_DATA_ROOT:?data root required}
catalogue=${CATALOGUE_HOST_DIR:?catalogue directory required}

network="praetorium-e2e-${port}"
app="praetorium-e2e-${port}"
postgres="praetorium-e2e-postgres-${port}"
valkey="praetorium-e2e-valkey-${port}"

cleanup() {
    docker rm --force "$app" "$postgres" "$valkey" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
rm -rf "$root"
mkdir -p "$root"
chmod 777 "$root"

docker network create "$network" >/dev/null

# Nothing is published to the host: only the app is reachable, and only on the
# port Playwright asked for.
docker run --rm --detach --name "$postgres" --network "$network" \
    --env POSTGRES_USER=praetorium \
    --env POSTGRES_PASSWORD=praetorium \
    --env POSTGRES_DB=praetorium \
    --tmpfs /var/lib/postgresql \
    "${POSTGRES_IMAGE:-postgres:18-alpine}" >/dev/null

docker run --rm --detach --name "$valkey" --network "$network" \
    "${VALKEY_IMAGE:-valkey/valkey:9-alpine}" >/dev/null

# The app migrates before it serves, so it must not start before Postgres answers.
for _ in $(seq 1 60); do
    if docker exec "$postgres" pg_isready -U praetorium -d praetorium >/dev/null 2>&1; then break; fi
    sleep 1
done

docker run --rm --name "$app" --network "$network" \
    --publish "127.0.0.1:${port}:3000" \
    --volume "${root}:/data" \
    --volume "${catalogue}:/catalogue:ro" \
    --env DATABASE_URL="postgres://praetorium:praetorium@${postgres}:5432/praetorium" \
    --env VALKEY_URL="redis://${valkey}:6379" \
    --env CATALOGUE_DIR=/catalogue \
    --env RULES_DIR=/catalogue/rules \
    --env AUTH_RATE_LIMIT=off \
    "$image" &

# Waiting rather than exec-ing, so the trap above still runs when Playwright stops us.
wait $!
