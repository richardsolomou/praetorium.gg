# Server functions

The TanStack Start server functions the browser and native shell call; each one wraps its work in rpc() for a read or mutationRpc() for a mutation.

## entrances

- server function reads: a browser or native shell reads account, roster, battle, league or reference data; the function resolves the caller and the service checks access
  handler: rpc in src/server/rpc.ts
  trust: visitor
- server function mutations: a browser or native shell changes account, roster, battle or league state, after the request's Origin is checked against this deployment
  handler: mutationRpc in src/server/rpc.ts
  trust: visitor
- register push device: a signed-in native shell registers its push token, through mutationRpc in registerPushDeviceRequest; an impersonating administrator is refused
  handler: registerPushDevice in notifications.ts
  trust: player
- unregister push device: a signed-in native shell removes its push token, through mutationRpc in unregisterPushDeviceRequest
  handler: unregisterPushDevice in notifications.ts
  trust: player

## invariants

- same-origin mutations: A server function mutation runs only for a request whose Origin belongs to this deployment.
  over: the missing, foreign, forwarded and same-origin requests ras-stack's mutation origin conformance suite sends through mutationRpc
  via: preserves mutation origin checks
  because: a signed-in player's browser carries its session cookie to any site that posts to us, so without the check another page could save, delete or submit for them
  crossing: visitor -> product store
  refuted: requireMutationOrigin returned without checking the Origin -> preserves mutation origin checks failed (2026-10-06)
  kinds: credential, identity
  checklist: capability-authorization dismissed: the session cookie's permission is checked by each service call, not by the origin check
  checklist: revalidated-permission dismissed: a mutation runs inside the request that carried it; nothing is queued for later
  checklist: message-authenticity dismissed: the Origin header is the browser's own claim, not a signed message
  checklist: encrypted-storage dismissed: the check stores nothing
  checklist: key-rotation-compatibility dismissed: no key is involved
  checklist: canonical-encoding dismissed: origins are compared as parsed URL origins by ras-stack, not as encoded identities
  checklist: identity-continuity dismissed: the check does not change who the caller is
  checklist: separation-of-duties dismissed: there is no approval step
