# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service. The source is available for inspection and contribution. [Running locally](development/running-locally.md) describes the development environment; this repository does not maintain a self-hosted service configuration.

The hosted web application runs on Dokploy. SQLite holds accounts and sessions on a volume shared by the production web replicas. SpacetimeDB holds rosters, battles, leagues, and realtime updates. R2 holds profile images, verified catalogue snapshots, and off-host backups. Each pull request preview has separate account and product databases; see [Pull request previews](development/pr-previews.md).

The release workflow builds one digest-pinned Node image after changes reach `main`, publishes the SpacetimeDB module without replacing its database, and deploys that image to Dokploy. GitHub builds the image; Dokploy pulls it without rebuilding. Staging uses the same deployment workflow with separate data. The [pull request preview workflow](development/pr-previews.md) creates isolated disposable data for each pull request.

The source-snapshot publisher resolves community data separately from the application, verifies each archive after upload, and updates the current pointer only after the archive is readable. Releases package a pinned, verified snapshot, so publishing a new snapshot does not change a running application's rules data.

Each web replica reads the packaged catalogue from its image and prepares it in memory. Production SQLite backups include the matching auth secret and are verified by restoring an off-host archive. The product database has its own off-host backup and restore check. Both web replicas and SpacetimeDB run on one VM, so a VM outage still interrupts the service until it is restored.
