# Routes

URLs, loaders, search validation, metadata and page composition, plus the server routes that answer outside callers directly.

## entrances

- route [.]well-known.$: an OAuth client or browser reads authorization server and protected resource metadata from Better Auth
  handler: Route in src/routes/[.]well-known.$.ts
  trust: visitor
  control: none — public OAuth and OpenID discovery metadata, the same for every caller
- route [.]well-known.apple-app-site-association: iOS reads which paths open in the native app
  handler: Route in src/routes/[.]well-known.apple-app-site-association.ts
  trust: visitor
  control: none — a static association file published for iOS
- route [.]well-known.assetlinks[.]json: Android reads which app may open the site's links
  handler: Route in src/routes/[.]well-known.assetlinks[.]json.ts
  trust: visitor
  control: none — a static association file published for Android
- route api/apple-notifications: Apple posts a signed account event, and a verified deletion removes the linked account
  handler: Route in src/routes/api/apple-notifications.ts
  trust: visitor
- route api/auth.$: a browser or native shell signs up, signs in, signs out or completes an OAuth flow through Better Auth
  handler: Route in src/routes/api/auth.$.ts
  trust: visitor
- route api/faction-icons.$id: a browser reads a faction icon from the active catalogue
  handler: Route in src/routes/api/faction-icons.$id.ts
  trust: visitor
- route api/health: the deployment probes whether the instance and its catalogue are ready
  handler: Route in src/routes/api/health.ts
  trust: visitor
  control: none — a readiness probe that reports only whether the instance and catalogue are ready
- route api/previews.battles.$token: a link unfurler reads a battle's preview card as a signed-out spectator
  handler: Route in src/routes/api/previews.battles.$token.ts
  trust: visitor
- route api/previews.datasheets.$catalogueId.$slug: a link unfurler reads a datasheet's preview card
  handler: Route in src/routes/api/previews.datasheets.$catalogueId.$slug.ts
  trust: visitor
- route api/previews.detachments.$catalogueId.$slug: a link unfurler reads a detachment's preview card
  handler: Route in src/routes/api/previews.detachments.$catalogueId.$slug.ts
  trust: visitor
- route api/previews.rosters.$id: a link unfurler reads an unlisted or public roster's preview card
  handler: Route in src/routes/api/previews.rosters.$id.ts
  trust: visitor
- route api/previews.site: a link unfurler reads the site's preview card
  handler: Route in src/routes/api/previews.site.ts
  trust: visitor
- route api/previews.users.$userId: a link unfurler reads a player profile's preview card
  handler: Route in src/routes/api/previews.users.$userId.ts
  trust: visitor
- route api/realtime.mode: a client asks which realtime database and URI to connect to
  handler: Route in src/routes/api/realtime.mode.ts
  trust: visitor
  control: none — returns the public realtime database name and URI that every client is told
- route api/release: a client asks which release is deployed
  handler: Route in src/routes/api/release.ts
  trust: visitor
  control: none — returns the public release version
- route api/simulator.optimize: a browser streams loadout alternatives for a combat matchup
  handler: Route in src/routes/api/simulator.optimize.ts
  trust: visitor
- route api/spacetime.token: a signed-in player obtains a SpacetimeDB access token for realtime subscriptions
  handler: Route in src/routes/api/spacetime.token.ts
  trust: player
- route indexnow[.]txt: IndexNow reads the site's ownership key
  handler: Route in src/routes/indexnow[.]txt.ts
  trust: visitor
  control: none — the IndexNow key is public by protocol; publishing it is its purpose
- route llms[.]txt: an agent or crawler reads the site's agent guide
  handler: Route in src/routes/llms[.]txt.ts
  trust: visitor
  control: none — static public agent guide
- route mcp: an MCP client calls reference tools anonymously, or account tools with an OAuth token and scope
  handler: Route in src/routes/mcp.ts
  trust: agent
- route robots[.]txt: a crawler reads which paths it may index
  handler: Route in src/routes/robots[.]txt.ts
  trust: visitor
  control: none — static public crawler policy
- route sitemap[.]xml: a crawler reads the public URLs with measured change dates
  handler: Route in src/routes/sitemap[.]xml.ts
  trust: visitor
  control: none — lists only public reference URLs with measured change dates

## invariants
