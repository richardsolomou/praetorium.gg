set dotenv-load

default:
    @just --list

install:
    corepack enable
    pnpm install

# The app and Centrifugo together, since live updates need both
dev:
    #!/usr/bin/env bash
    # Centrifugo goes in the background and is taken down on the way out, so a
    # stray container cannot outlive the terminal that started it.
    set -euo pipefail
    mkdir -p data-dev
    just realtime --detach
    cleanup() {
        docker rm --force praetorium-realtime >/dev/null 2>&1 || true
    }
    trap cleanup EXIT INT TERM
    DATA_DIR=./data-dev CATALOGUE_DIR=./catalogue-data RULES_DIR=./catalogue-data/rules pnpm dev

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

# Price every datasheet against the Munitorum. A ratchet: it may not go down
points:
    pnpm catalogue:points

db-generate:
    pnpm db:generate

db-check:
    pnpm db:check

e2e-install:
    pnpm exec playwright install chromium

e2e-build:
    docker build -t praetorium-e2e .

# Browsers against the container image, which is the topology that ships
e2e *args: e2e-build
    pnpm exec playwright test {{ args }}

e2e-run *args:
    pnpm exec playwright test {{ args }}

e2e-trace *args: e2e-build
    PLAYWRIGHT_TRACE=1 pnpm exec playwright test {{ args }}
