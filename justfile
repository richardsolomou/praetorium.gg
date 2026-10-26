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
    pnpm exec tsx scripts/dev.ts status

dev-stop:
    pnpm exec tsx scripts/dev.ts stop

dev-restart:
    pnpm exec tsx scripts/dev.ts restart

# Stop this worktree's stack and remove the browser-test stacks it or a deleted worktree left behind; run once its PR has merged
teardown:
    pnpm exec tsx scripts/teardown.ts

# Export production roster selections without account data or notes
rosters-fetch snapshot="data-dev/production-rosters.json":
    node --env-file-if-exists=.env.local --import tsx scripts/productionRosters.ts fetch "{{ snapshot }}"

# Copy the snapshot into this worktree's preview account without overwriting local edits
rosters-import snapshot="data-dev/production-rosters.json":
    pnpm exec tsx scripts/productionRosters.ts import "{{ snapshot }}"

# Check saved selections against a catalogue, optionally comparing a baseline
rosters-audit *args:
    pnpm exec tsx scripts/productionRosters.ts audit {{ args }}

# Rewrite saved loadouts that disagree with their built units; --apply writes production
rosters-normalise *args:
    node --env-file-if-exists=.env.local --import tsx scripts/productionRosters.ts normalise {{ args }}

# The native application against this worktree's running preview
mobile *args:
    url="${EXPO_PUBLIC_APP_URL:-$(node --import tsx scripts/mobileAppUrl.ts ios)}" && EXPO_PUBLIC_APP_URL="$url" pnpm mobile {{ args }}

mobile-ios:
    url="${EXPO_PUBLIC_APP_URL:-$(node --import tsx scripts/mobileAppUrl.ts ios)}" && EXPO_PUBLIC_APP_URL="$url" pnpm --dir mobile ios

mobile-android:
    url="${EXPO_PUBLIC_APP_URL:-$(node --import tsx scripts/mobileAppUrl.ts android)}" && EXPO_PUBLIC_APP_URL="$url" pnpm --dir mobile android

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
    pnpm test:python

# Fast tests without databases or subprocess-backed snapshot verification
test-unit *args:
    pnpm test:unit {{ args }}

# Database, service, authentication and snapshot integration tests
test-integration *args:
    pnpm test:integration {{ args }}

# Format, lint, database, catalogue pins, build, typecheck, all Vitest and Python tests
check:
    pnpm check

# Prepare a local catalogue from the shared snapshot or pinned public sources
catalogue-prepare:
    pnpm exec tsx scripts/syncCatalogue.ts --prepare

# Activate the exact release snapshot; downloading requires private store access
catalogue-sync:
    pnpm catalogue:sync

# Validate the pinned snapshot and exercise its catalogue release flows
catalogue-preflight:
    pnpm catalogue:sync
    pnpm exec vitest run scripts/lib/offlineReferenceBundle.test.ts src/server/catalogueEditions.test.ts
    pnpm exec playwright test --grep @catalogue

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

# Build catalogue/'s pinned sources and corrections without changing the active snapshot
catalogue-materialize *args:
    pnpm catalogue:materialize {{ args }}

# Compare configured pins with approved branch heads without activating them
catalogue-upstream:
    pnpm exec tsx scripts/syncCatalogue.ts --upstream

# Compile upstream sources into Praetorium's canonical datasheet catalogue
catalogue-compile:
    pnpm catalogue:compile

# Report canonical catalogue gaps; pass --details for every finding
catalogue-audit *args:
    pnpm exec tsx scripts/auditCanonicalCatalogue.ts {{ args }}

# Build the data-update history seed from every published snapshot and the sources' own history: --out <file>
catalogue-history-seed *args:
    pnpm catalogue:history-seed {{ args }}

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

# Zip the ChatGPT directory plugin into dist/ for upload
plugin-zip:
    mkdir -p dist && rm -f dist/praetorium-plugin.zip
    cd plugin && zip -qr ../dist/praetorium-plugin.zip . -x '.claude-plugin/*'

e2e-install:
    pnpm exec playwright install chromium --only-shell

# Browsers against isolated local SQLite, object storage, and SpacetimeDB
e2e *args:
    pnpm exec playwright test {{ args }}

# Rerun test edits against one isolated production stack; restart after application edits
e2e-ui *args:
    pnpm exec playwright test --ui {{ args }}

# Verify a fresh production build without reading or writing the browser-test build cache
e2e-cold *args:
    PLAYWRIGHT_BUILD_CACHE=off pnpm exec playwright test {{ args }}

e2e-native-auth-ios:
    pnpm exec tsx e2e/nativeAuthIos.ts

# Save a native reference, stop its service, and reopen it from device storage
e2e-native-offline-ios:
    NATIVE_OFFLINE_VERIFY=1 pnpm exec tsx e2e/nativeAuthIos.ts

# Build a visitor roster in the native app, sign in with a system provider, and check the account saved it
e2e-native-guest-draft-ios:
    NATIVE_GUEST_DRAFT_VERIFY=1 pnpm exec tsx e2e/nativeAuthIos.ts

e2e-trace *args:
    PLAYWRIGHT_TRACE=1 pnpm exec playwright test {{ args }}

# Rebalance the CI end-to-end runners from the median test durations several CI runs recorded
e2e-durations +runs:
    for run in {{ runs }}; do gh run download "$run" --pattern 'e2e-report-*' --dir "${TMPDIR:-/tmp}/praetorium-e2e-reports-$run"; done
    pnpm exec tsx scripts/e2eShard.ts --record $(for run in {{ runs }}; do ls "${TMPDIR:-/tmp}/praetorium-e2e-reports-$run"/*/*.json; done)

# Build the native watch companion and capture its three screens with debug demo data
watch-simulator:
    pnpm exec tsx scripts/watchSimulator.ts

watch-test:
    swift test --package-path mobile/watch
