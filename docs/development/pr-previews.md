# Pull request previews

Pull requests except automated release candidates receive disposable Dokploy previews at `pr-<number>.praetorium.gg`. The PR's status comment links readiness and failures. Ready means `/api/health` reports the expected commit, not merely that a container started.

`.github/workflows/dokploy-preview-image.yml` builds a digest-pinned image without deployment credentials. The trusted `dokploy-preview-deploy.yml` job and `scripts/dokployPreview.ts` deploy its module and isolated data. Fork artifacts require maintainer approval before trusted deployment.

Each preview has separate SQLite accounts, a SpacetimeDB database, secret, operator identity, auth issuer, and audience. It uses its own pinned catalogue. Redeployment resets both stores and ends old sessions; deterministic seed IDs retain cross-store links, and revision-specific issuers refresh signing keys.

Use `preview@praetorium.gg` / `preview-preview-preview` and `opponent@praetorium.gg` / `opponent-opponent-opponent` for the primary seats. Previews are public and disposable; keep sensitive data out.

Closing/merging removes preview resources; scheduled pruning recovers missed cleanup. [Deployment](../deployment.md) owns production, and [Running locally](running-locally.md) owns interactive development stacks.
