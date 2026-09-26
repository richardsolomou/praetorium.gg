# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service. The source is available for inspection and contribution. [Running locally](development/running-locally.md) describes the development environment; this repository does not maintain a self-hosted service configuration.

The hosted web application runs on Cloudflare Workers. D1 holds accounts and sessions, SpacetimeDB holds rosters, battles, leagues, and realtime updates, and R2 holds profile images and verified catalogue snapshots. The Worker packages the catalogue data it needs at build time. Each pull request preview has separate account and product databases; see [Pull request previews](development/pr-previews.md).

The release workflow builds and deploys the Worker after changes reach `main`. It verifies the account and product databases before deployment, checks the served revision and public assets, then stops the replaced VM services. The first production cutover requires stopping writes to the previous application, transferring and verifying its final account, product, and public object data, and setting the cutover readiness flag before merging. The release refuses to switch traffic while the previous application is running.

The source-snapshot publisher resolves community data separately from the application, verifies each archive after upload, and updates the current pointer only after the archive is readable. Releases package a pinned, verified snapshot, so publishing a new snapshot does not change a running Worker's rules data.
