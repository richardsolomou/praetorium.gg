# Pull request previews

Every pull request from a branch in this repository gets its own Praetorium instance. The workflow builds a container image and deploys it to an isolated preview URL.

One pull request comment shows the current state:

- 🔄 A new version is building. The current preview stays available until deployment finishes.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ Deployment failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

The `PR preview deploy` check shows the same state.

Each preview has an empty database and no persistent volume. A new deployment removes its battles and accounts, then recreates the shared preview login shown on the sign-in page. The preview fetches catalogue data after startup, so list building can appear after the health check passes.

Closing or merging removes the instance. A weekly prune removes previews left behind by a failed cleanup.

Previews are public, as is the shared preview login. Do not store sensitive data in them.

Fork builds do not receive deployment secrets. They upload an image artifact. The trusted `preview-deploy.yml` workflow publishes it after maintainer approval.

Push again or rerun the workflow to redeploy.
