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
  control: none — serves public faction icons from the verified catalogue and reads no account or product state
- route api/health: the deployment probes whether the instance and its catalogue are ready
  handler: Route in src/routes/api/health.ts
  trust: visitor
  control: none — a readiness probe that reports only whether the instance and catalogue are ready
- route api/realtime.mode: a client asks which realtime database and URI to connect to
  handler: Route in src/routes/api/realtime.mode.ts
  trust: visitor
  control: none — returns the public realtime database name and URI that every client is told
- route api/release: a client asks which release is deployed
  handler: Route in src/routes/api/release.ts
  trust: visitor
  control: none — returns the public release version
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

- scoped MCP account tools: An MCP call to an account tool runs only with an OAuth token carrying that tool's scope; an anonymous caller reaches only the public reference tools.
  over: the tools handleReferenceMcp dispatches, account tools by their ACCOUNT_MCP_SCOPES entry and reference tools without one
  via: challenges account tools while keeping public reference tools available
  because: /mcp serves anonymous reference reads and signed-in account tools on one endpoint, so an account tool reached without its scope would read or change a player's rosters and battles
  crossing: agent -> product store
  refuted: handleReferenceMcp sent unauthenticated account tools down the anonymous path -> challenges account tools while keeping public reference tools available failed (2026-10-08)
  kinds: credential
  checklist: capability-authorization declared as scoped MCP account tools
  checklist: revalidated-permission dismissed: each call is authorized in the request that carries it; nothing is queued
  checklist: message-authenticity dismissed: the bearer token is verified by Better Auth's MCP plugin, not by a message signature this bullet checks
  checklist: encrypted-storage dismissed: the check stores nothing
  checklist: key-rotation-compatibility dismissed: no key is held here
  checklist: separation-of-duties dismissed: there is no approval step

- signed apple notifications: An Apple account notification changes an account only when its payload verifies against Apple's signing key for this app.
  over: the notification payloads appleNotificationResponse receives, signed by the expected key and by an unrelated one
  via: rejects unsigned notifications and acknowledges email relay changes
  because: the endpoint is public and a verified account-delete event deletes the player's account; an unsigned or foreign payload must change nothing
  crossing: visitor -> account store
  refuted: appleNotificationResponse decoded the payload without verifying it -> rejects unsigned notifications and acknowledges email relay changes failed (2026-10-08)
  kinds: message
  checklist: destination-confinement dismissed: the endpoint answers Apple and sends nothing onward
  checklist: message-authenticity declared as signed apple notifications
  checklist: input-validation dismissed: the body is size-bounded and schema-parsed before verification; the verification is the invariant
  checklist: retry-recognition dismissed: deleting an already deleted account is a no-op
  checklist: duplicate-suppression dismissed: a repeated event deletes nothing new
  checklist: keyed-ordering dismissed: events are independent per account
  checklist: acknowledgment-barrier dismissed: Apple retries on failure and the effect is idempotent
  checklist: retry-classification dismissed: verification failures answer 400 and are not retried by design
- same-origin sign-in: A sign-in request whose Origin is not one this deployment trusts is refused before any credential is checked.
  over: the sign-in requests Better Auth's handler receives with a foreign Origin, here a loopback origin against a hosted APP_URL
  via: does not trust loopback sign-in origins for a hosted app
  because: a signed-in browser carries its cookies to any page that posts to /api/auth, so a foreign page could sign a player in, link a provider or change credentials for them
  crossing: visitor -> account store
  refuted: Better Auth's origin check was disabled -> does not trust loopback sign-in origins for a hosted app failed (2026-10-08)
  kinds: credential, identity
  checklist: capability-authorization dismissed: credentials are checked by Better Auth after this origin check; this bullet is the origin check
  checklist: revalidated-permission dismissed: sign-in runs in the request that carries it
  checklist: message-authenticity dismissed: the Origin header is the browser's claim, not a signed message
  checklist: encrypted-storage dismissed: the check stores nothing
  checklist: key-rotation-compatibility dismissed: no key is held here
  checklist: canonical-encoding dismissed: origins are compared by Better Auth's trusted origin list, not as encoded identities
  checklist: identity-continuity dismissed: the check does not change who the caller is
  checklist: separation-of-duties dismissed: there is no approval step
- signed-in realtime tokens: A realtime access token is issued only to a signed-in player.
  over: the requests /api/spacetime/token answers, signed out and signed in
  via: issues no realtime token to a signed-out caller
  because: the token admits its holder to the product database as that player, so issuing one without a session would let anyone subscribe as a player
  crossing: player -> product store
  refuted: the route issued a token without a signed-in player -> issues no realtime token to a signed-out caller failed (2026-10-08)
  kinds: credential
  checklist: capability-authorization declared as signed-in realtime tokens
  checklist: revalidated-permission dismissed: the token is short-lived and SpacetimeDB rechecks it at connect through admitted connections
  checklist: message-authenticity dismissed: the session cookie is checked by Better Auth, not as a signed message here
  checklist: encrypted-storage dismissed: the route stores nothing
  checklist: key-rotation-compatibility dismissed: signing keys belong to Better Auth's JWT plugin, not this route
  checklist: separation-of-duties dismissed: there is no approval step
- seated battle tokens: A realtime token names a battle only when its player is seated in that battle.
  over: the battle ids /api/spacetime/token resolves through userBattleId for the signed-in player
  via: issues no realtime token for a battle the player is not seated in
  because: a battle id in the token lets the client subscribe to that battle's signals, so a non-seated player must not receive one for a private battle
  crossing: player -> product store
  refuted: the route named the requested battle without checking the seat -> issues no realtime token for a battle the player is not seated in failed (2026-10-08)
  kinds: read
  checklist: scoped-reads declared as seated battle tokens
  checklist: redaction dismissed: the route returns an id or refuses; it renders no battle fields
