# Pull request previews

Each pull request except an automated release candidate gets a disposable preview. The image build and deployment are separate jobs. A preview is marked ready only after its application reports the expected commit from the health endpoint.

One pull request comment shows the current state:

- 🔄 A new version is building or deploying.
- ⏸️ A preview from a fork is waiting for a maintainer to approve its build.
- ✅ The preview serves the listed commit.
- ❌ The image, deployment, or CI failed; the link goes to the workflow run.
- 🗑️ The pull request closed, and the preview was deleted.

Each preview has a separate authentication database, product database, application secret, and product operator identity. The two databases for one pull request are seeded together with four test accounts, saved rosters, friendships, favourites, a collection, battles, and league events. A fresh deployment recreates its disposable data. Previews share a product database server, but their database names, authentication issuers, and token audiences are distinct.

The primary test logins are `preview@praetorium.gg` / `preview-preview-preview` and `opponent@praetorium.gg` / `opponent-opponent-opponent`. Supporting team seats use two more disposable accounts. Previews are public and are not a place for sensitive data.

Fork builds do not receive deployment credentials. A trusted deployment workflow consumes the build artifact only after approval. Closing or merging a pull request removes its preview resources, and a scheduled prune removes resources left behind by failed cleanup.
