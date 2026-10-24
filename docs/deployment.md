# Hosted deployment

[praetorium.gg](https://praetorium.gg) is the supported service; the repository maintains no self-hosted service configuration. [Running locally](development/running-locally.md) and [Mobile release](development/mobile-release.md) own their own paths.

## Runtime

Dokploy runs the web replicas, with SQLite accounts/sessions and the runtime catalogue cache on a shared volume and SpacetimeDB for product state. Public R2 stores profile images, application assets and optional compiled catalogue caches; private R2 stores catalogue snapshots, backups, the audit cache, feedback screenshots and collection photos. The replicas and product database share one VM, so an outage requires restoration.

The Node server trusts Cloudflare's visitor header for proxying and rate limits, so restrict origin traffic to Cloudflare: direct callers could otherwise choose that header.

Signed-out reference pages carry a 20-second `s-maxage` (`src/server/sharedPageCache.ts`). A Cloudflare Cache Rule on the `praetorium.gg` host, configured outside the repository, makes HTML cacheable except requests carrying a `better-auth.` cookie or under `/_serverFn/` and `/api/`. Its edge TTL uses the origin's `Cache-Control` and bypasses when it is absent; its browser TTL respects the origin, because the zone's four-hour Browser Cache TTL would otherwise raise `max-age=0`. Nothing purges the edge after a deploy, so for up to 20 seconds a cached page can reference removed assets.

The separate “Cache public reference API and images” Cloudflare rule allows only GET/HEAD requests on `praetorium.gg` for `/api/reference/v1` and its children, `/api/faction-icons/`, `/api/previews/site`, datasheet and detachment previews, `/logo.svg`, and `/favicon.svg`. It follows origin cache headers, bypasses responses without them, respects the origin's browser TTL, and uses raw request-header values for `Vary` so the reference API's JSON and Markdown representations remain separate. Keep query strings in the cache key. Collection photos, feedback screenshots, player/roster/battle previews, and server functions stay outside this rule; do not replace it with a blanket `/api/` cache rule.

`e2e/caching.spec.ts` checks the served headers and conditional reads. After changing an edge rule, verify repeated production GETs reach `CF-Cache-Status: HIT`, alternate JSON and Markdown requests at the same URL, and confirm inaccessible photos and missing assets remain uncached.

## Delivery

`dokploy-web.yml` publishes images, migrates product data, deploys by digest and checks health. Staging has separate data. Dokploy pulls private GHCR images for production and previews using `GHCR_PULL_TOKEN` (classic, `read:packages`); expiry blocks deployment.

`.github/workflows/release.yml` runs daily or on dispatch, stopping if production serves `main`'s head; scheduled runs first need CI's full suite to pass on that commit: pending changesets create a `[skip ci]` release commit on `main`, tag and GitHub Release before deployment; otherwise it deploys `main`'s head. [Mobile release](development/mobile-release.md#build-and-upload) owns app rebuilds. Release pushes use `CHANGESETS_TOKEN`, a fine-grained owner token with `main` ruleset admin bypass; expiry or lost access blocks deployment. Rollbacks require `dokploy-web.yml`'s `workflow_dispatch` with a `revision`; the next daily run redeploys `main` unless Release is disabled.

`Dockerfile.node` carries no fetched catalogue data. Startup prepares source data, server projections and browser downloads in the persistent catalogue cache; the background worker refreshes that data from configured branches without rebuilding or restarting the image. [Catalogue data](development/catalogue/sources.md#runtime-updates) owns validation, atomic activation and retention. The image must contain `server/combat-calculation-worker.mjs` ([Combat simulation](development/combat-simulation.md)). It ships no curl or wget, so health check commands run `node /app/scripts/healthcheck.ts`.

Each deploy keeps old and new versions compatible:

- First, `scripts/publishWebAssets.ts` copies hashed assets from the installed and replacement images to public R2 and routes `/assets/` reads there, so older open tabs and rollbacks keep working.
- Product publication requires a migration plan/token. Automatic schema migrations may disconnect clients; manual migrations stop delivery without clearing data.
- The module reads its auth issuer, audience, and operator identity from required SpacetimeDB environment values (`AUTH_ISSUER`, `AUTH_AUDIENCE`, `OPERATOR_IDENTITY`). Publishes keep stored values, so `dokploy-web.yml` sends none; a database without them refuses the publish and keeps its installed module. Previews and local stacks send them as `spacetime-environment` headers (`scripts/lib/spacetimeEnvironment.ts`). Change a stored value with `spacetime env` or `PATCH /v1/database/<name>/environment`.
- The product module is published before replicas change, so the previous web build reads rows through `src/server/spacetimeOperator.ts`; keep new columns and result fields optional and appended.
- Between module publication and the replica update, `scripts/migrateProductData.ts` upgrades saved rows in atomic, rerunnable batches; failure stops delivery. Keep product readers compatible during the backfill, and remove historical-row branches only after verifying the live database upgrade. Web-only rollbacks reuse the installed module and skip the migration.
- Application assets stay pinned to the image. Catalogue data and its browser downloads advance together through the runtime updater, retaining the last complete revision on failure.

`scripts/lib/startupBudget.ts` bounds readiness for both Swarm and `scripts/nodeServer.ts`. Cached startups can serve their retained catalogue while the updater checks for changes. A new compiler key means a replica prepares its catalogue before it serves, so production's worker publishes each catalogue it activates to the private bucket (`scripts/lib/liveCatalogueArchive.ts`), and each production deploy prepares the release's catalogue beside the image build (`dokploy-web.yml`). `scripts/nodeServer.ts`'s shutdown must finish within Docker's ten-second stop grace period. [Catalogue data](development/catalogue/sources.md#sources-and-loading) owns runtime loading and memory.

The offline reference and app manifests (`offline-reference-version.json`, `offline-app-version.json`) are uncached and point to retained hashed assets. The reference and construction downloads are gzip data served as `application/octet-stream` without HTTP content encoding, so the client decompresses it consistently through Nitro and the CDN. Keep generated bundles and copied rules out of Git.

Open pages poll the uncached `/api/release` and offer a manual Refresh for a newer version. `/whats-new` reads `CHANGELOG.md`, so changeset summaries are player-facing copy; [Contributing](../CONTRIBUTING.md#pull-requests-and-releases) sets what they may say, and an entry players should not see is deleted from `CHANGELOG.md` directly. `INDEXNOW_KEY` is production-only; the release keeps its before/after sitemaps in the `production-sitemaps` artifact. `TYPESAFE_API_KEY` is production-only too, so only real uploads are screened.

`scripts/announceDiscord.ts` needs secret `DISCORD_ANNOUNCEMENTS_WEBHOOK_URL` and variable `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`. Retain R2 receipts across webhook rotations; inspect pending deliveries before retrying.

## Pull request previews

Pull requests receive disposable Dokploy previews at `pr-<number>.praetorium.gg`; the PR's status comment links readiness and failures. Ready means `/api/health` reports the expected commit, not merely that a container started.

`.github/workflows/dokploy-preview-image.yml` builds a digest-pinned image without deployment credentials; the trusted `dokploy-preview-deploy.yml` job and `scripts/dokployPreview.ts` deploy it. Only fork artifacts need maintainer approval before trusted deployment.

Each preview has its own SQLite accounts, SpacetimeDB database, secret, operator identity, auth issuer, and audience. Redeployment resets both stores and ends old sessions; deterministic seed IDs retain cross-store links. Previews share one runtime catalogue cache (`scripts/dokployPreview.ts`), so an approved fork preview can alter what other previews serve, never production. Sign in with `preview@praetorium.gg` / `preview-preview-preview` or `opponent@praetorium.gg` / `opponent-opponent-opponent`. Previews are public; keep sensitive data out. Closing or merging removes preview resources, and scheduled pruning recovers missed cleanup.

## Backups

Auth backups include the matching secret and are checked by restoring an off-host archive. Product backups preserve data and identity volumes together. `scripts/spacetime-backup.service`, `scripts/spacetime-backup.timer`, and the backup scripts own scheduling/retention; `backup-readback.yml` owns verification.

Copying the running product database uses a bounded freeze with an independent resume watchdog. Resume before upload/readback. Verify archive checksums, paired-volume manifest, and freshness on restore. Do not scale the database down or pull helper images while frozen. A backup command succeeding does not prove restoration.
