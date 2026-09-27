# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service. The source is available for inspection and contribution. [Running locally](development/running-locally.md) describes the development environment; this repository does not maintain a self-hosted service configuration.

The hosted web application runs on Cloudflare Workers. D1 holds accounts and sessions, SpacetimeDB holds rosters, battles, leagues, and realtime updates, and R2 holds profile images and verified catalogue snapshots. The Worker packages the catalogue data it needs at build time. Each pull request preview has separate account and product databases; see [Pull request previews](development/pr-previews.md).

The release workflow builds the Worker and SpacetimeDB module after changes reach `main`, checks that the production account and product stores contain data, publishes the module without replacing its database, deploys the Worker, and verifies its revision and public object routes. The staging workflow deploys the same topology without touching production. The [pull request preview workflow](development/pr-previews.md) creates isolated disposable databases for each pull request.

The source-snapshot publisher resolves community data separately from the application, verifies each archive after upload, and updates the current pointer only after the archive is readable. Releases package a pinned, verified snapshot, so publishing a new snapshot does not change a running Worker's rules data.

## Staging VM canary

`Dockerfile.node-canary` builds an experimental Node service for protected staging tests. It keeps the full verified catalogue in memory after startup, uses a local SQLite file for accounts, connects directly to an isolated database on the staging SpacetimeDB instance, and stores avatars in R2. Startup waits for the catalogue, auth store, and SpacetimeDB to pass health checks. Its SQLite backup command makes a consistent copy with the matching auth secret and verifies a restore from the off-host archive. Production and pull request previews continue to use Workers while the canary is measured.
