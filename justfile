set dotenv-load

default:
    @just --list

install:
    corepack enable
    pnpm install

# Start or reuse this worktree's persistent Vite, SQLite, object storage, and SpacetimeDB stack
dev:
    pnpm dev

dev-status:
    pnpm dev:status

dev-stop:
    pnpm dev:stop

dev-restart:
    pnpm dev:restart

# The native application against the local development service
mobile *args:
    EXPO_PUBLIC_APP_URL="${EXPO_PUBLIC_APP_URL:-http://localhost:3000}" pnpm mobile -- {{ args }}

mobile-ios:
    EXPO_PUBLIC_APP_URL="${EXPO_PUBLIC_APP_URL:-http://localhost:3000}" pnpm mobile:ios

mobile-android:
    EXPO_PUBLIC_APP_URL="${EXPO_PUBLIC_APP_URL:-http://10.0.2.2:3000}" pnpm mobile:android

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

# Build committed catalogue sources and corrections without changing the active snapshot
catalogue-materialize *args:
    pnpm catalogue:materialize {{ args }}

# Compare current upstream revisions with the published snapshot without activating them
catalogue-upstream:
    pnpm catalogue:upstream

# Compile upstream sources into Praetorium's canonical datasheet catalogue
catalogue-compile:
    pnpm catalogue:compile

# Report canonical catalogue gaps; pass --details for every finding
catalogue-audit *args:
    pnpm catalogue:audit -- {{ args }}

# Build the data-update history seed from every published snapshot and the sources' own history: --out <file>
catalogue-history-seed *args:
    pnpm catalogue:history-seed -- {{ args }}

# Ratchet description coverage across the fetched rules sources
descriptions:
    pnpm catalogue:descriptions

# Price every datasheet against the Munitorum. A ratchet: it may not go down
points:
    pnpm catalogue:points

# Write everything the app can say about the synced data. Add --compare before.json to list what a snapshot lost
coverage *args:
    pnpm catalogue:coverage {{ args }}

# Measure agent retrieval against the verified active snapshot
reference-evaluate:
    pnpm reference:evaluate

# Exercise the deployed agent reference, including its JavaScript-free HTML
reference-verify origin:
    pnpm reference:verify "{{ origin }}"

e2e-install:
    pnpm exec playwright install chromium --only-shell

# Browsers against isolated local SQLite, object storage, and SpacetimeDB
e2e *args:
    pnpm exec playwright test {{ args }}

e2e-run *args:
    pnpm exec playwright test {{ args }}

e2e-native-auth-ios:
    pnpm test:e2e:native-auth:ios

# Save a native reference, stop its service, and reopen it from device storage
e2e-native-offline-ios:
    NATIVE_OFFLINE_VERIFY=1 pnpm test:e2e:native-auth:ios

# Build a visitor roster in the native app, sign in with a system provider, and check the account saved it
e2e-native-guest-draft-ios:
    NATIVE_GUEST_DRAFT_VERIFY=1 pnpm test:e2e:native-auth:ios

e2e-trace *args:
    PLAYWRIGHT_TRACE=1 pnpm exec playwright test {{ args }}

# Rebalance the CI end-to-end runners from the test durations one CI run recorded
e2e-durations run:
    gh run download {{ run }} --pattern 'e2e-report-*' --dir "${TMPDIR:-/tmp}/praetorium-e2e-reports-{{ run }}"
    pnpm exec tsx scripts/e2eShard.ts --record "${TMPDIR:-/tmp}"/praetorium-e2e-reports-{{ run }}/*/*.json

# Build the native watch companion and capture its three screens with debug demo data
watch-simulator:
    pnpm exec tsx scripts/watchSimulator.ts

watch-test:
    swift test --package-path mobile/watch
