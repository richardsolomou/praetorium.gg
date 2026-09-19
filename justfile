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
    DATA_DIR=./data-dev CATALOGUE_DIR=./catalogue-data RULES_DIR=./catalogue-data/rules CATALOGUE_UPDATE_MODE=pinned pnpm dev

# The native application against the local development service
mobile *args:
    EXPO_PUBLIC_APP_URL="${EXPO_PUBLIC_APP_URL:-http://localhost:3000}" pnpm mobile -- {{ args }}

mobile-ios:
    EXPO_PUBLIC_APP_URL="${EXPO_PUBLIC_APP_URL:-http://localhost:3000}" pnpm mobile:ios

mobile-android:
    EXPO_PUBLIC_APP_URL="${EXPO_PUBLIC_APP_URL:-http://10.0.2.2:3000}" pnpm mobile:android

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

# Fast tests without databases or subprocess-backed snapshot verification
test-unit *args:
    pnpm test:unit -- {{ args }}

# Database, service, authentication and snapshot integration tests
test-integration *args:
    pnpm test:integration -- {{ args }}

# Format, lint, database, catalogue pins, build, typecheck, unit tests
check:
    pnpm check

# Activate the release-pinned catalogue from one cache shared by every worktree
catalogue-sync:
    pnpm catalogue:sync

# Follow the publisher's newest catalogue instead of the release pin
catalogue-latest:
    pnpm catalogue:sync --latest

# Download the verified release-pinned archive for an offline deployment
catalogue-bundle output="catalogue-snapshot.zip":
    CATALOGUE_SNAPSHOT_FILE="{{ output }}" pnpm catalogue:snapshot download

# Create a complete Git bundle at an explicit location outside this worktree
repository-backup destination:
    sh scripts/backupRepository.sh "{{ destination }}"

# Verify the pinned revisions without fetching
catalogue-check:
    pnpm catalogue:check

# Compile upstream sources into Praetorium's canonical datasheet catalogue
catalogue-compile:
    pnpm catalogue:compile

# Report canonical catalogue gaps; pass --details for every finding
catalogue-audit *args:
    pnpm catalogue:audit -- {{ args }}

# Ratchet description coverage across the fetched rules sources
descriptions:
    pnpm catalogue:descriptions

# Price every datasheet against the Munitorum. A ratchet: it may not go down
points:
    pnpm catalogue:points

# How much of what the catalogue offers the released 40kdc dataset can also express
parity *args:
    pnpm catalogue:parity {{ args }}

# Cross-check 40kdc's generated loadout variants against this app's reading of BSData. Needs KDC_CORE
variants:
    pnpm catalogue:variants

# Write everything the app can say about the synced data. Add --compare before.json to list what a snapshot lost
coverage *args:
    pnpm catalogue:coverage {{ args }}

db-generate:
    pnpm db:generate

db-check:
    pnpm db:check

# Bring the schema up to date against DATABASE_URL
db-migrate:
    pnpm db:migrate

# A disposable preview world with accounts, armies, battles, and leagues
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

e2e-native-auth-ios: e2e-build
    pnpm test:e2e:native-auth:ios

e2e-trace *args: e2e-build e2e-down
    PLAYWRIGHT_TRACE=1 pnpm exec playwright test {{ args }}

# Remove a previous run's containers. Playwright refuses to start if one still
# holds the port, and it probes before it runs anything of ours.
e2e-down:
    sh e2e/stack-down.sh ${PLAYWRIGHT_PORT:-4173}
