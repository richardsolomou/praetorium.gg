set dotenv-load

default:
    @just --list

install:
    corepack enable
    pnpm install

# The app, Centrifugo, Postgres, Valkey and MinIO together, since the app needs all five
dev:
    #!/usr/bin/env bash
    # Centrifugo goes in the background and is taken down on the way out, so a
    # stray container cannot outlive the terminal that started it. Postgres,
    # Valkey and MinIO are left running: their data is worth keeping between sessions.
    set -euo pipefail
    mkdir -p data-dev
    just services
    just realtime --detach
    cleanup() {
        docker rm --force praetorium-realtime >/dev/null 2>&1 || true
    }
    trap cleanup EXIT INT TERM
    export DATABASE_URL="${DATABASE_URL:-postgres://praetorium:praetorium@127.0.0.1:5432/praetorium}"
    export VALKEY_URL="${VALKEY_URL:-redis://127.0.0.1:6379}"
    export S3_ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:9000}"
    export S3_BUCKET="${S3_BUCKET:-praetorium}"
    export S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-praetorium}"
    export S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-praetorium-storage}"
    export S3_PUBLIC_BASE_URL="${S3_PUBLIC_BASE_URL:-http://127.0.0.1:9000/praetorium}"
    pnpm db:migrate
    DATA_DIR=./data-dev CATALOGUE_DIR=./catalogue-data RULES_DIR=./catalogue-data/rules pnpm dev

# Postgres, Valkey and MinIO alone, for when the dev server is already running
services *args:
    sh scripts/devServices.sh {{ args }}

# Take the development Postgres, Valkey and MinIO down
services-down:
    sh scripts/devServices.sh down

# Centrifugo alone, for when the dev server is already running
realtime *args:
    sh scripts/realtime.sh {{ args }}

format:
    pnpm format

lint:
    pnpm lint

build:
    pnpm build

typecheck:
    pnpm typecheck

test *args:
    pnpm exec vitest run {{ args }}

# Format, lint, database, catalogue pins, build, typecheck, unit tests
check:
    pnpm check

# Fetch the community catalogues (about 130MB, gitignored)
catalogue-sync:
    pnpm catalogue:sync

# Verify the pinned revisions without fetching
catalogue-check:
    pnpm catalogue:check

# Ratchet description coverage across the fetched rules sources
descriptions:
    pnpm catalogue:descriptions

# Price every datasheet against the Munitorum. A ratchet: it may not go down
points:
    pnpm catalogue:points

db-generate:
    pnpm db:generate

db-check:
    pnpm db:check

# Bring the schema up to date against DATABASE_URL
db-migrate:
    pnpm db:migrate

# Two signed-in-able accounts, four armies and their friendship, into the development database
seed:
    #!/usr/bin/env bash
    set -euo pipefail
    just services
    export DATABASE_URL="${DATABASE_URL:-postgres://praetorium:praetorium@127.0.0.1:5432/praetorium}"
    pnpm db:migrate
    pnpm db:seed

# One-off: move any inline profile picture still in DATABASE_URL into S3_* object storage
profile-images-migrate:
    pnpm profile-images:migrate

e2e-install:
    pnpm exec playwright install chromium --only-shell

e2e-build:
    docker build -t praetorium-e2e .

# Browsers against the container image, which is the topology that ships
e2e *args: e2e-build e2e-down
    pnpm exec playwright test {{ args }}

e2e-run *args: e2e-down
    pnpm exec playwright test {{ args }}

e2e-trace *args: e2e-build e2e-down
    PLAYWRIGHT_TRACE=1 pnpm exec playwright test {{ args }}

# Remove a previous run's containers. Playwright refuses to start if one still
# holds the port, and it probes before it runs anything of ours.
e2e-down:
    sh e2e/stack-down.sh ${PLAYWRIGHT_PORT:-4173}
