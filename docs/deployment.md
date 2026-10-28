# Hosted deployment

## Cloudflare

- Origin traffic must stay restricted to Cloudflare; the server trusts its visitor header for rate limits.
- Two rules live in the Cloudflare dashboard, not the repository. The HTML Cache Rule skips `better-auth.` cookies, `/_serverFn/`, and `/api/`, and its browser TTL must respect the origin. "Cache public reference API and images" lists public paths explicitly; never replace it with a blanket `/api/` rule, because photos, screenshots, private previews, and server functions must stay uncached.

## Delivery

- `release.yml` releases each merge to `main`, or on dispatch, then `dokploy-web.yml` deploys it. Roll back by dispatching `dokploy-web.yml` with a `revision`; the next merge redeploys `main` unless Release is disabled.
- Expiry of `GHCR_PULL_TOKEN` or `CHANGESETS_TOKEN` blocks deployment.
- Old and new versions coexist during a deploy: keep new module columns and result fields optional and appended, never remove or rename a result field until a release no longer reads it, and keep readers compatible while `scripts/migrateProductData.ts` backfills. The new server only takes traffic once its catalogue is built, minutes after the module lands, so the released server reads the new module all that time. `scripts/releasedServer.test.ts` runs the latest release's preview seed, which reads back every procedure it can reach, against the module in memory; CI's unit lane points `RELEASED_CHECKOUT` at that release, and locally it runs with `RELEASED_CHECKOUT=<checkout of the release> pnpm exec vitest run scripts/releasedServer.test.ts`. The same file fails when a procedure is neither read back by `scripts/seedPreview.ts` nor listed as unreachable, so a new read is covered from the next release on.
- The module's `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `OPERATOR_IDENTITY` are stored SpacetimeDB environment values that publishes do not send; change them with `spacetime env`.
- `scripts/nodeServer.ts` must stop within Docker's ten-second grace period.
- Remove a `/whats-new` entry by editing `CHANGELOG.md`.
- Rotating `DISCORD_ANNOUNCEMENTS_WEBHOOK_URL` must keep the R2 receipts; inspect pending deliveries before retrying an announcement.

## Pull request previews

- Previews run at `pr-<number>.praetorium.gg`; ready means `/api/health` reports the expected commit. Fork artifacts need maintainer approval.
- Previews are public and share one runtime catalogue cache; keep sensitive data out. Redeploying resets their data.
- Sign in with `preview@praetorium.gg` / `preview-preview-preview` or `opponent@praetorium.gg` / `opponent-opponent-opponent`.

## Backups

- Copying the running product database freezes it: resume before upload, and never scale the database down or pull helper images while frozen.
