# Pull request previews

Every pull request from a branch in this repository gets its own Praetorium instance. The repository supplies its package, domain, port, and environment template to ras-stack's standard Dokploy preview workflows. They publish a commit-specific image alongside production images as `ghcr.io/richardsolomou/praetorium.gg:preview-pr-<number>-sha-<commit>` and deploy its digest to an isolated preview URL. Dokploy's configured image shows what is live, while the workflow and pull request status show what is being deployed.

One pull request comment shows the current state:

- 🔄 A new version is building. The current preview stays available until deployment finishes.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ Deployment failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

The `PR preview deploy` check shows the same state.

Each preview has an empty database and no persistent volume. A new deployment removes its battles and accounts, then recreates the shared preview login before the application starts. The container enables preview seeding for the `pr-<number>.praetorium.gg` application URL; the deploy configuration also sets `PRAETORIUM_SEED_PREVIEW=true` explicitly. It downloads the same current verified snapshot as production from the shared snapshot service after startup.

Closing or merging removes the instance and its preview images. A weekly prune removes previews and images left behind by a failed cleanup.

The seeded account is `preview@praetorium.gg` with password `preview-preview-preview`. Previews are public, as is the shared preview login. Do not store sensitive data in them.

Fork builds do not receive deployment secrets. They upload an image artifact. The trusted `preview-deploy.yml` workflow publishes it after maintainer approval.

Push again or rerun the workflow to redeploy.
