# Pull request previews

Every pull request from a branch in this repository gets a disposable Praetorium instance. The preview workflows build a commit-specific image and deploy it to the URL in the pull request comment. The comment identifies the commit that the preview serves.

One pull request comment shows the current state:

- 🔄 A new version is building. The current preview stays available until deployment finishes.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ Deployment failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

The `PR preview deploy` check shows the same state.

Each preview has an empty database and no persistent volume. A new deployment removes its battles and accounts. It then recreates the shared preview login before the application starts. The pull request comment contains the login details. The preview downloads the same current verified snapshot as production after startup.

Closing or merging removes the instance and its preview images. A weekly prune removes previews and images left behind by a failed cleanup.

Previews and their shared login are public. Do not store sensitive data in them.

Fork builds do not receive deployment secrets. They upload an image artifact. The trusted `preview-deploy.yml` workflow publishes it after maintainer approval.

Push again or rerun the workflow to redeploy.
