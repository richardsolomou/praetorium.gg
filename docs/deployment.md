# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service. The source is available for inspection and contribution. [Running locally](development/running-locally.md) describes the development environment; this repository does not maintain a self-hosted service configuration.

The hosted web application runs on Cloudflare Workers. D1 holds accounts and sessions, SpacetimeDB holds rosters, battles, leagues, and realtime updates, and R2 holds profile images and verified catalogue snapshots. The Worker packages the catalogue data it needs at build time. Each pull request preview has separate account and product databases; see [Pull request previews](development/pr-previews.md).

The release workflow builds and deploys the Worker after changes reach `main`. On the first release, it stops writes to the previous application, takes a fresh off-host Postgres backup, restores and exports its final account and product data, and copies public objects to R2. It refreshes the account database while preserving its signing keys, replaces the earlier product import, and verifies both stores before routing traffic. A failure before the route change restarts the previous application. Once the Worker serves the expected revision and public objects from R2, the workflow stops the replaced production services. Later releases update the Worker and product module without reimporting the old database.

The source-snapshot publisher resolves community data separately from the application, verifies each archive after upload, and updates the current pointer only after the archive is readable. Releases package a pinned, verified snapshot, so publishing a new snapshot does not change a running Worker's rules data.
