# Pull request previews

Each pull request gets a temporary Praetorium instance. One workflow builds a commit-specific image. The preview and CI use that image. The pull request comment names the deployed commit.

One pull request comment shows the current state:

- 🔄 A new version is building. The current preview stays available until deployment finishes.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ The image, deployment, or CI failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

The `PR preview deploy` check shows the same state.

Previews use a Postgres server that is separate from production. Each preview has its own database. Every deployment recreates that database, two test accounts, two rosters, and one friendship. Previews use one replica and no Valkey.

`scripts/previewDeploy.ts` composes the environment rather than `preview-deploy.yml`, because it carries a Postgres URL and that file is public. The URL arrives in the `PREVIEW_APP_SECRETS` repository secret, a JSON object holding one key:

```json
{ "PREVIEW_DATABASE_ADMIN_URL": "postgres://user:password@preview-postgres:5432/postgres" }
```

Any other key is refused rather than passed through. The preview Postgres is reachable from Dokploy and not from a CI runner, which is why the database is created inside the container rather than by the workflow.

The next preview deployment removes databases for closed pull requests. Dokploy supplies the active preview list. If that request fails, cleanup removes nothing. The pull request comment contains both test logins. Each preview downloads the current verified snapshot.

Closing or merging removes the instance and its preview images. A weekly prune removes previews and images left behind by a failed cleanup.

Previews and their shared login are public. Do not store sensitive data in them.

Fork builds do not receive deployment secrets. They upload an image artifact. The trusted `preview-deploy.yml` workflow publishes it after maintainer approval. Internal pull requests publish directly to the container registry, and CI runners pull that exact image instead of transferring a second copy.

Push again or rerun the workflow to redeploy.
