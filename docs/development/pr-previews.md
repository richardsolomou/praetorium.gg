# Pull request previews

Each pull request gets a temporary Praetorium instance. One workflow builds a commit-specific image. The preview and CI use that image. The pull request comment names the deployed commit.

One pull request comment shows the current state:

- 🔄 A new version is building. The current preview stays available until deployment finishes.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ The image, deployment, or CI failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

The `PR preview deploy` check shows the same state.

Previews use a Postgres server that is separate from production. Each preview has its own database. Every deployment recreates that database with four test accounts, saved rosters from eight factions, a complete friendship graph, favourites, a collection, casual battles in every table shape, and league events in every table shape. Previews use one replica and no Valkey.

`scripts/previewDeploy.ts` composes the environment rather than `preview-deploy.yml`, because it carries a Postgres URL and that file is public. The URL arrives in the `PREVIEW_APP_SECRETS` repository secret, a JSON object holding one key:

```json
{ "PREVIEW_DATABASE_ADMIN_URL": "postgres://user:password@preview-postgres:5432/postgres" }
```

Any other key is refused rather than passed through. The preview Postgres is reachable from Dokploy and not from a CI runner, which is why the database is created inside the container rather than by the workflow.

The startup reset derives its only database target from that preview's `DATABASE_URL`; it does not receive a list of other previews. This keeps concurrent previews isolated even when Dokploy restarts an older deployment. The pull request comment contains the two primary test logins. Supporting team seats use two more disposable accounts. Each preview derives the seeded battle and sealed league rosters from its verified snapshot, fetching one first when none is installed.

Closing or merging removes the instance and its preview images. A weekly prune removes previews and images left behind by a failed cleanup.

Previews and their shared login are public and are not a place for sensitive data.

Fork builds do not receive deployment secrets. They upload an image artifact. The trusted `preview-deploy.yml` workflow publishes it after maintainer approval. Internal pull requests publish directly to the container registry, and CI runners pull that exact image instead of transferring a second copy.

Dependabot image builds run automatically, but deployment waits for a required reviewer on the `dependabot-preview` GitHub environment. Closing a Dependabot pull request removes its preview without another approval.

A new push or workflow rerun triggers redeployment.
