# Pull request previews

Each pull request except an automated release candidate gets a disposable Dokploy preview. GitHub builds a digest-pinned Node image separately from the trusted deployment job. A preview is marked ready only after its application reports the expected commit from the health endpoint.

One pull request comment shows the current state:

- 🔄 A new version is building or deploying.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ The build, deployment, or CI failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

Each preview has a separate SQLite authentication file, SpacetimeDB product database, application secret, and product operator identity. The deployed application seeds four test accounts, saved rosters, friendships, favourites, a collection, battles, and league events. A fresh deployment recreates its disposable data. Previews share a SpacetimeDB server and use their own pull request's pinned catalogue snapshot, but their database names, authentication issuers, and token audiences are distinct.
The preview's token issuer includes the commit revision so SpacetimeDB fetches the new signing keys when a deployment recreates its authentication database. Existing preview sessions end on redeployment.
The image contains the pull request's pinned, verified catalogue snapshot and product module. The trusted deployment job extracts that module, creates the preview database, and deploys the pinned image.

The primary test logins are `preview@praetorium.gg` / `preview-preview-preview` and `opponent@praetorium.gg` / `opponent-opponent-opponent`. Supporting team seats use two more disposable accounts. Previews are public and are not a place for sensitive data.

Fork builds do not receive deployment credentials. A trusted deployment workflow consumes the build artifact only after approval. Closing or merging a pull request removes its preview resources, and a scheduled prune removes resources left behind by failed cleanup.
