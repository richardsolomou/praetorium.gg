#!/bin/sh
# Postgres and Valkey for local development, in containers that outlive nothing.
#
# The data lives in named volumes rather than the repository, so a reset is a
# `docker volume rm` and never a stray directory. Ports are overridable because a
# developer may already have a Postgres of their own on the default one.
set -eu

action=${1:-up}
postgres_name=${POSTGRES_CONTAINER:-praetorium-postgres-dev}
valkey_name=${VALKEY_CONTAINER:-praetorium-valkey-dev}
postgres_port=${POSTGRES_PORT:-5432}
valkey_port=${VALKEY_PORT:-6379}
postgres_image=${POSTGRES_IMAGE:-postgres:18-alpine}
valkey_image=${VALKEY_IMAGE:-valkey/valkey:9-alpine}

if [ "$action" = "down" ]; then
    docker rm --force "$postgres_name" "$valkey_name" >/dev/null 2>&1 || true
    echo "stopped $postgres_name and $valkey_name"
    exit 0
fi

running() {
    [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]
}

if ! running "$postgres_name"; then
    docker rm --force "$postgres_name" >/dev/null 2>&1 || true
    docker run --detach --name "$postgres_name" \
        --publish "127.0.0.1:$postgres_port:5432" \
        --env POSTGRES_USER=praetorium \
        --env POSTGRES_PASSWORD=praetorium \
        --env POSTGRES_DB=praetorium \
        --volume praetorium-postgres-dev:/var/lib/postgresql \
        "$postgres_image" >/dev/null
    echo "started $postgres_name on $postgres_port"
fi

if ! running "$valkey_name"; then
    docker rm --force "$valkey_name" >/dev/null 2>&1 || true
    docker run --detach --name "$valkey_name" \
        --publish "127.0.0.1:$valkey_port:6379" \
        "$valkey_image" >/dev/null
    echo "started $valkey_name on $valkey_port"
fi

# The app migrates before it serves, so waiting here rather than there keeps the
# failure legible: a database that never came up says so, once.
printf 'waiting for postgres'
attempt=0
until docker exec "$postgres_name" pg_isready -U praetorium -d praetorium >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt 60 ]; then
        echo ' — gave up'
        exit 1
    fi
    printf '.'
    sleep 1
done
echo ' ready'
