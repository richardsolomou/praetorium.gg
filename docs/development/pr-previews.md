# Pull request previews

Every pull request gets a disposable Praetorium instance. A dedicated workflow builds a commit-specific image once. The preview deploys that image as soon as it is ready while CI tests the same image in parallel. The comment identifies the commit that the preview serves.

One pull request comment shows the current state:

- 🔄 A new version is building. The current preview stays available until deployment finishes.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ The image, deployment, or CI failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

The `PR preview deploy` check shows the same state.

Each preview needs a `DATABASE_URL`. Its accounts and battles live in that Postgres rather than on a disposable volume, so a preview starts empty only when it points at a database of its own. Every deployment recreates two shared preview logins, a saved roster for each, and their confirmed friendship before the application starts. `VALKEY_URL` is not needed: a preview is a single replica. The pull request comment contains both logins so two browser sessions can play each other. The preview downloads the same current verified snapshot as production after startup.

Closing or merging removes the instance and its preview images. A weekly prune removes previews and images left behind by a failed cleanup.

Previews and their shared login are public. Do not store sensitive data in them.

Fork builds do not receive deployment secrets. They upload an image artifact. The trusted `preview-deploy.yml` workflow publishes it after maintainer approval. Internal pull requests publish directly to the container registry, and CI runners pull that exact image instead of transferring a second copy.

Push again or rerun the workflow to redeploy.
