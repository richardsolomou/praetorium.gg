# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service. [Running locally](development/running-locally.md) covers contribution; the repository maintains no self-hosted service configuration. [PR previews](development/pr-previews.md) and [Mobile release](development/mobile-release.md) own their delivery paths.

## Runtime

Dokploy runs the web replicas. SQLite accounts/sessions share a production volume; SpacetimeDB owns product state and realtime updates. Public R2 stores profile images/catalogues; private R2 stores backups/audit cache. The replicas and product database share one VM, so an outage requires restoration.

The Node server trusts Cloudflare's visitor header for proxying/rate limits. Restrict origin traffic to Cloudflare: direct callers could otherwise choose that header. Failed hashed-asset responses use `no-store` during rolling updates so an old replica cannot poison the new revision's asset cache.

## Delivery

`.github/workflows/dokploy-web.yml` owns image publication, product migration, Dokploy deployment, and health checks. It deploys a digest-pinned image without rebuilding it. Production follows main/releases; staging uses separate data. `scripts/releaseProof.sh` permits CI reuse only for an exact previously tested tree.

Product publication requires a migration plan/token. Automatic schema migrations may disconnect clients; manual migrations stop delivery without clearing data. Catalogue assets are pinned and verified inside the image; publishing a source snapshot alone does not update the running service.

After production deployment, `scripts/submitIndexNow.ts` waits for every replica's revision and submits measured sitemap additions/changes. `INDEXNOW_KEY` is production-only; missing keys disable submission, and submission failure does not fail the release.

## Backups

Auth backups include the matching secret and are checked by restoring an off-host archive. Product backups preserve data and identity volumes together. `scripts/spacetime-backup.service`, `scripts/spacetime-backup.timer`, and the backup scripts own scheduling/retention; `backup-readback.yml` owns verification.

Copying the running product database uses a bounded freeze with an independent resume watchdog. Resume before upload/readback. Verify archive checksums, paired-volume manifest, and freshness on restore. Do not scale the database down or pull helper images while frozen. A backup command succeeding does not prove restoration.
