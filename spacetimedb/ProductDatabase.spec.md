# Product database

The SpacetimeDB module that stores rosters, battles, leagues, friendships and revision signals, and admits callers by identity.

## entrances

- operator procedures: the web server, connected as the configured operator identity, reads and writes product state through procedures and reducers that call requireOperator
  handler: requireOperator in spacetimedb/src/index.ts
  trust: operator
- player connection: a browser or native shell connects with a deployment-issued access token, watches battles, revokes its own access and subscribes to its own signal views
  handler: onConnect in spacetimedb/src/index.ts
  trust: player
- configure: the database owner sets the token issuer, audience and operator identity once
  handler: configure in spacetimedb/src/index.ts
  trust: operator

## invariants

- admitted connections: A client connects as a player only with an unexpired, unrevoked access token this deployment issued for its audience, and as a guest only with SpacetimeDB's own token for its identity.
  over: the claims admitConnection decides for the owner, the operator, guests and players
  via: refuses a token this deployment did not issue, has revoked, or has let expire
  because: onConnect is the only check between a WebSocket client and the product database; a token from another issuer, a revoked session or a token valid for longer than ten minutes would let a stranger or a signed-out player read as someone else
  crossing: player -> product store
  refuted: admitConnection stopped comparing the token's issuer -> refuses a token this deployment did not issue, has revoked, or has let expire failed (2026-10-08)
  kinds: credential, identity
  checklist: capability-authorization declared as admitted connections
  checklist: revalidated-permission declared as admitted connections
  checklist: message-authenticity dismissed: SpacetimeDB verifies the JWT signature before onConnect runs; this bullet checks the verified claims
  checklist: encrypted-storage dismissed: session rows hold subjects and expiry, not secrets
  checklist: key-rotation-compatibility dismissed: signing keys belong to Better Auth's JWT plugin
  checklist: canonical-encoding dismissed: identities are compared as SpacetimeDB's hex form on both sides
  checklist: identity-continuity dismissed: a changed identity for a known session is refused by onConnect after admission, outside this decision
  checklist: separation-of-duties dismissed: there is no approval step
