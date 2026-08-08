# Pull request previews

Every pull request from a branch in this repository gets its own Praetorium instance. The workflow builds a container image and deploys it to an isolated preview URL.

One comment on the pull request tracks it:

- 🔄 A new version is building and deploying. Whatever is already up stays up until it lands.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview is serving the listed commit.
- ❌ Deployment failed; the link goes to the workflow run.
- 🗑️ The pull request closed and the preview was deleted.

The same states appear as a `PR preview deploy` commit check, so the pull request's own list says where the preview is.

A preview is a whole instance with an empty database, and every deployment replaces the container. There is no volume: battles played in a preview are gone at the next push, which is the point. It fetches its own copy of the community catalogues on first use, so list building becomes available a minute or two after the health check passes — the app serves battles in the meantime.

Closing or merging removes the instance. A weekly prune removes previews left behind by a failed cleanup.

Previews are publicly reachable and use the app's normal sign-in. Do not put anything into one you would not put into the live site.

Fork builds never receive deployment secrets. They upload the image as an artifact, and the trusted `preview-deploy.yml` workflow publishes and deploys it only after maintainer approval.

Push again or rerun the workflow to redeploy.
