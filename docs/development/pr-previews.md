# Pull request previews

Every pull request gets a disposable Praetorium instance. A dedicated workflow builds a commit-specific image once. The preview deploys that image as soon as it is ready while CI tests the same image in parallel. The comment identifies the commit that the preview serves.

One pull request comment shows the current state:

- 🔄 A new version is building. The current preview stays available until deployment finishes.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ The image, deployment, or CI failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

The `PR preview deploy` check shows the same state.

Previews share one Postgres of their own, separate from production, and each takes a database in it named after its pull request. The container drops and recreates that database before it migrates, so every deployment still starts empty. It then recreates two shared preview logins, a saved roster for each, and their confirmed friendship before the application starts. No Valkey: a preview is a single replica, and one shared between previews would put every preview's sessions in the same keyspace.

`scripts/previewDeploy.ts` composes the environment rather than `preview-deploy.yml`, because it carries a Postgres URL and that file is public. The URL arrives in the `PREVIEW_APP_SECRETS` repository secret, a JSON object holding one key:

```json
{ "PREVIEW_DATABASE_ADMIN_URL": "postgres://user:password@preview-postgres:5432/postgres" }
```

Any other key is refused rather than passed through. The preview Postgres is reachable from Dokploy and not from a CI runner, which is why the database is created inside the container rather than by the workflow.

Closed pull requests are cleaned up by the next deployment of any preview. The deploy asks Dokploy which preview applications exist, since Dokploy is the authority on what is alive, and passes those numbers to the container, which drops every other `praetorium_pr_<number>`. A deploy that cannot determine the list drops nothing rather than guessing. The pull request comment contains both logins so two browser sessions can play each other. The preview downloads the same current verified snapshot as production after startup.

Closing or merging removes the instance and its preview images. A weekly prune removes previews and images left behind by a failed cleanup.

Previews and their shared login are public. Do not store sensitive data in them.

Fork builds do not receive deployment secrets. They upload an image artifact. The trusted `preview-deploy.yml` workflow publishes it after maintainer approval. Internal pull requests publish directly to the container registry, and CI runners pull that exact image instead of transferring a second copy.

Push again or rerun the workflow to redeploy.
