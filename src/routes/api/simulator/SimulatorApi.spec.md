# Simulator API

The streaming loadout optimizer the combat simulator calls with a matchup.

## entrances

- route api/simulator/optimize: a browser streams loadout alternatives for a combat matchup
  handler: Route in optimize.ts
  trust: visitor

## invariants

- same-origin optimization: The loadout optimizer runs only for a request whose Origin belongs to this deployment, before any catalogue is loaded.
  over: the requests /api/simulator/optimize receives with a foreign and a same Origin
  via: refuses a cross-origin optimization before loading the catalogue
  because: an optimization streams many evaluated loadouts and is the heaviest unauthenticated work the server does, so a foreign page must not drive it from visitors' browsers
  crossing: visitor -> verified catalogue
  refuted: the route no longer called requireMutationOrigin -> refuses a cross-origin optimization before loading the catalogue failed (2026-10-08)
  kinds: budget
  checklist: bounded-admission declared as same-origin optimization
  checklist: fair-admission dismissed: there is no shared queue; an aborted request stops its own generator
  checklist: rate-budget dismissed: no per-client rate is enforced here; the origin check is the bound this bullet claims
  checklist: memory-budget dismissed: candidates stream in batches rather than accumulating
  checklist: execution-budget dismissed: the request's abort signal stops the generator; not checked by this bullet
  checklist: circuit-breaker-policy dismissed: no downstream dependency is called
