# Pull request previews

Every pull request from a branch in this repository gets its own Praetorium instance on the self-hosted [Dokploy](https://dokploy.com) server. The workflow builds a container image, publishes it as `ghcr.io/richardsolomou/praetorium.gg-preview:pr-<number>`, and creates or updates a Dokploy application named `praetorium-pr-<number>` at `pr-<number>.praetorium.gg`.

One comment on the pull request tracks it:

- 🔄 A new version is building and deploying. Whatever is already up stays up until it lands.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview is serving the listed commit.
- ❌ Deployment failed; the link goes to the workflow run.
- 🗑️ The pull request closed and the preview was deleted.

The same states appear as a `PR preview deploy` commit check, so the pull request's own list says where the preview is.

A preview is a whole instance with an empty database, and every deployment replaces the container. There is no volume: battles played in a preview are gone at the next push, which is the point. It fetches its own copy of the community catalogues on first use, so list building becomes available a minute or two after the health check passes — the app serves battles in the meantime.

Closing or merging removes the application. A weekly prune removes any left behind by a failed cleanup, and it only ever touches applications named `praetorium-pr-<number>` with no matching open pull request.

Previews are publicly reachable and use the app's normal sign-in. Do not put anything into one you would not put into the live site.

## Setup

One-time, on the Dokploy server:

- Pick a Dokploy project and environment for previews. The environment id is in its URL: `/dashboard/project/<projectId>/environment/<environmentId>`.
- Generate an API key under **Settings → Profile → API/CLI**.
- Point a wildcard DNS record at the server: `*.praetorium.gg`.
- Make sure a Let's Encrypt contact email is configured under **Settings → Server**, so Traefik can issue certificates for each preview hostname.

Repository secrets:

- `DOKPLOY_URL` — the Dokploy base URL
- `DOKPLOY_API_KEY` — the key generated above
- `DOKPLOY_ENVIRONMENT_ID` — the environment previews live in
- `PREVIEW_REGISTRY_USERNAME` and `PREVIEW_REGISTRY_PASSWORD` (optional) — what Dokploy pulls the image with, if the package stays private

The first run creates `ghcr.io/richardsolomou/praetorium.gg-preview` as a private package: either make it public or set the two registry secrets.

In the repository's Actions settings, require approval for workflows from all outside collaborators. A pull request from a branch here builds and publishes its image directly. A fork's build never sees a secret — it uploads the image as an artifact, and `preview-deploy.yml`, which is this repository's own code running on `workflow_run`, is what publishes and deploys it.

To redeploy, push again or rerun the workflow. To remove one by hand, delete its application in Dokploy or run:

```sh
DOKPLOY_URL=… DOKPLOY_API_KEY=… DOKPLOY_ENVIRONMENT_ID=… PR_NUMBER=123 pnpm exec tsx scripts/previewDeploy.ts delete
```
