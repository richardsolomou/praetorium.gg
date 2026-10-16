# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service; the repository maintains no self-hosted service configuration. [Running locally](development/running-locally.md) and [Mobile release](development/mobile-release.md) own their own paths.

## Runtime

Dokploy runs the web replicas, with SQLite accounts/sessions on a shared volume and SpacetimeDB for product state. Public R2 stores profile images and catalogues; private R2 stores backups, the audit cache, feedback screenshots and collection photos. The replicas and product database share one VM, so an outage requires restoration.

The Node server trusts Cloudflare's visitor header for proxying and rate limits, so restrict origin traffic to Cloudflare: direct callers could otherwise choose that header. Asset errors use `no-store` so a missing file cannot poison the browser or edge cache.

Signed-out reference pages carry a 20-second `s-maxage` (`src/server/sharedPageCache.ts`), below the browser's 30-second query staleness so hydrated data needs no refetch; pages that read cookies while rendering and signed-in responses send none. A Cloudflare Cache Rule on the `praetorium.gg` host, configured outside the repository, makes HTML cacheable except requests carrying a `better-auth.` cookie or under `/_serverFn/` and `/api/`. Its edge TTL uses the origin's `Cache-Control` and bypasses when it is absent; its browser TTL respects the origin, because the zone's four-hour Browser Cache TTL would otherwise raise `max-age=0`. Nothing purges the edge after a deploy, so for up to 20 seconds a cached page can reference removed assets.

## Delivery

`.github/workflows/dokploy-web.yml` owns image publication, product migration, deployment, and health checks, deploying a digest-pinned image without rebuilding it. Staging uses separate data.

`.github/workflows/release.yml` runs on every push to `main`: with pending changesets it commits a `[skip ci]` release commit directly on `main`, tags it, creates the GitHub Release, and deploys it; otherwise it deploys the pushed commit. [Mobile release](development/mobile-release.md#build-and-upload) owns whether a release rebuilds the app. The release push uses the `CHANGESETS_TOKEN` repository secret, a fine-grained owner token that the `main` ruleset's admin bypass lets past required checks; if it expires or loses access, production is not deployed until the secret is replaced. A release deploy refuses a revision that does not contain the one production runs (the installed image's `sha-` tag), so re-running an older release cannot roll back; roll back explicitly through `dokploy-web.yml`'s `workflow_dispatch` with a `revision`.

`Dockerfile.node` builds the application once, so the `amd64` and `arm64` variants carry identical hashed assets and product module. Nitro copies the build platform's native `libsql` binary, so the image replaces it with the target platform's and fails if it cannot load. The image must contain `server/combat-calculation-worker.mjs` ([Combat simulation](development/combat-simulation.md)). It ships no curl or wget; plain health check commands use `node scripts/healthcheck.ts`.

Each deploy keeps old and new versions compatible:

- First, `scripts/publishWebAssets.ts` copies hashed assets from the installed and replacement images to public R2 and routes `/assets/` reads there, so older open tabs and rollbacks keep working.
- Product publication requires a migration plan/token. Automatic schema migrations may disconnect clients; manual migrations stop delivery without clearing data.
- The product module is published before replicas change, so the previous web build reads rows with columns it does not know. `src/server/spacetimeOperator.ts` parses module results with non-strict schemas that drop unknown fields; keep new columns and result fields optional and appended.
- Between module publication and the replica update, `scripts/migrateProductData.ts` upgrades saved rows in atomic, rerunnable batches; failure stops delivery. Keep product readers compatible during the backfill, and remove historical-row branches only after verifying the live database upgrade. Web-only rollbacks reuse the installed module and skip the migration.
- Catalogue assets are pinned and verified inside the image; publishing a source snapshot alone does not update the running service.

The start period in `scripts/configureDokployNode.ts` must be at least as long as the readiness loop in `scripts/nodeServer.ts`, since warming retained rules can take over a minute on the production VM. That proxy opens its public listener only after the Nitro child is healthy; its readiness requests share one deadline and the shutdown signal rather than short per-request timeouts, and its shutdown must finish within Docker's ten-second stop grace period. [Catalogue data](development/catalogue-data.md#sources-and-loading) owns runtime loading and memory.

The offline reference and app manifests (`offline-reference-version.json`, `offline-app-version.json`) are uncached and point to retained hashed assets. The reference is gzip data served as `application/octet-stream` without HTTP content encoding, so the client decompresses it consistently through Nitro and the CDN. Keep generated bundles and copied rules out of Git.

Open pages poll the uncached `/api/release` and offer a manual Refresh for a newer version. `/whats-new` reads `CHANGELOG.md`, so changeset summaries are player-facing copy. `INDEXNOW_KEY` is production-only; IndexNow submission failure does not fail the release. `TYPESAFE_API_KEY` is production-only too, so only real uploads are screened.

## Pull request previews

Pull requests receive disposable Dokploy previews at `pr-<number>.praetorium.gg`; the PR's status comment links readiness and failures. Ready means `/api/health` reports the expected commit, not merely that a container started.

`.github/workflows/dokploy-preview-image.yml` builds a digest-pinned image without deployment credentials; the trusted `dokploy-preview-deploy.yml` job and `scripts/dokployPreview.ts` deploy it. Fork artifacts require maintainer approval before trusted deployment.

Each preview has its own SQLite accounts, SpacetimeDB database, secret, operator identity, auth issuer, audience, and pinned catalogue. Redeployment resets both stores and ends old sessions; deterministic seed IDs retain cross-store links. Sign in with `preview@praetorium.gg` / `preview-preview-preview` or `opponent@praetorium.gg` / `opponent-opponent-opponent`. Previews are public; keep sensitive data out. Closing or merging removes preview resources, and scheduled pruning recovers missed cleanup.

## Backups

Auth backups include the matching secret and are checked by restoring an off-host archive. Product backups preserve data and identity volumes together. `scripts/spacetime-backup.service`, `scripts/spacetime-backup.timer`, and the backup scripts own scheduling/retention; `backup-readback.yml` owns verification.

Copying the running product database uses a bounded freeze with an independent resume watchdog. Resume before upload/readback. Verify archive checksums, paired-volume manifest, and freshness on restore. Do not scale the database down or pull helper images while frozen. A backup command succeeding does not prove restoration.
