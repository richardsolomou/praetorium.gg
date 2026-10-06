# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service. [Running locally](development/running-locally.md) covers contribution; the repository maintains no self-hosted service configuration. [PR previews](development/pr-previews.md) and [Mobile release](development/mobile-release.md) own their delivery paths.

## Runtime

Dokploy runs the web replicas. SQLite accounts/sessions share a production volume; SpacetimeDB owns product state and realtime updates. Public R2 stores profile images/catalogues; private R2 stores backups/audit cache. The replicas and product database share one VM, so an outage requires restoration.

The Node server trusts Cloudflare's visitor header for proxying/rate limits. Restrict origin traffic to Cloudflare: direct callers could otherwise choose that header. Asset errors use `no-store` so a missing file cannot poison the browser or edge cache.

## Delivery

`.github/workflows/dokploy-web.yml` owns image publication, product migration, Dokploy deployment, and health checks. It deploys a digest-pinned image without rebuilding it. Production follows main/releases; staging uses separate data. `scripts/releaseProof.sh` permits CI reuse only for an exact previously tested tree.

Before changing replicas or publishing the product module, the workflow copies hashed assets from the installed and replacement images to `web-assets/` in public R2. It verifies their bytes and immutable cache headers through storage and the public CDN, then routes same-origin `/assets/` reads directly to that store through Traefik. Hosted route verification restores the previous configuration on failure. Asset errors use the application's uncached miss handler. Source maps are excluded; retained files remain available to older open tabs and rollbacks.

The client build generates the public offline reference from the same catalogue projections as hosted reads. `offline-reference-version.json` and `offline-app-version.json` are uncached manifests pointing to retained hashed assets. Reference versions depend only on reference content; application versions cover both JavaScript and CSS. The reference is gzip data in a `.bin` asset, served as `application/octet-stream` without HTTP content encoding so the client decompresses it consistently through Nitro and the CDN. Generation requires the pinned catalogue and fails on incomplete data or asset limits. Keep generated bundles and copied rules out of Git.

The public Node proxy owns a separate Nitro child process. Shutdown stops accepting connections, closes upgraded connections, and drains HTTP requests for up to five seconds before stopping Nitro. The child then has three seconds to exit, within Docker's ten-second stop grace period. The public listener opens only after the child's `/api/health` succeeds.

Open pages check an uncached `/api/release` endpoint once a minute while visible and when focus returns. A newer web version offers a manual Refresh action, including inside the native WebView. `/reference-worker.js` is uncached so browsers receive the current navigation behavior after deployment. When introducing this header, purge that URL from the edge cache after deployment to remove previously cached responses. Native shell updates use compatible over-the-air updates and app-store builds; [Mobile release](development/mobile-release.md) owns compatibility and delivery.

Product publication requires a migration plan/token. Automatic schema migrations may disconnect clients; manual migrations stop delivery without clearing data. Catalogue assets are pinned and verified inside the image; publishing a source snapshot alone does not update the running service.

After production deployment, `scripts/submitIndexNow.ts` waits for every replica's revision and submits measured sitemap additions/changes. `INDEXNOW_KEY` is production-only; missing keys disable submission, and submission failure does not fail the release.

## Backups

Auth backups include the matching secret and are checked by restoring an off-host archive. Product backups preserve data and identity volumes together. `scripts/spacetime-backup.service`, `scripts/spacetime-backup.timer`, and the backup scripts own scheduling/retention; `backup-readback.yml` owns verification.

Copying the running product database uses a bounded freeze with an independent resume watchdog. Resume before upload/readback. Verify archive checksums, paired-volume manifest, and freshness on restore. Do not scale the database down or pull helper images while frozen. A backup command succeeding does not prove restoration.
