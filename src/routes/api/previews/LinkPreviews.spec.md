# Link previews

The preview images link unfurlers fetch for battles, rosters, players, datasheets, detachments and the site; every one renders what a signed-out visitor may see.

## entrances

- route api/previews/battles.$token: a link unfurler reads a battle's preview card as a signed-out spectator
  handler: Route in battles.$token.ts
  trust: visitor
- route api/previews/datasheets.$catalogueId.$slug: a link unfurler reads a datasheet's preview card
  handler: Route in datasheets.$catalogueId.$slug.ts
  trust: visitor
- route api/previews/detachments.$catalogueId.$slug: a link unfurler reads a detachment's preview card
  handler: Route in detachments.$catalogueId.$slug.ts
  trust: visitor
- route api/previews/rosters.$id: a link unfurler reads an unlisted or public roster's preview card
  handler: Route in rosters.$id.ts
  trust: visitor
- route api/previews/site: a link unfurler reads the site's preview card
  handler: Route in site.ts
  trust: visitor
- route api/previews/users.$userId: a link unfurler reads a player profile's preview card
  handler: Route in users.$userId.ts
  trust: visitor

## invariants

- signed-out battle previews: A battle's link preview reads the battle as a signed-out spectator, never as whoever is asking.
  over: the battle reads the preview route makes through service.screen
  via: reads a battle as a signed-out spectator
  because: unfurlers fetch with whatever cookies the sharer's client holds, so a preview read as the requester would put a private battle's score and armies on a public card
  crossing: product store -> visitor
  refuted: the preview read the battle as a named viewer -> reads a battle as a signed-out spectator failed (2026-10-08)
  kinds: read, output
  checklist: scoped-reads declared as signed-out battle previews
  checklist: destination-confinement dismissed: the image is returned to the requester only
  checklist: redaction dismissed: field hiding is battleView's, under the Core invariant secret mission secrecy
  checklist: commit-ordered-effects dismissed: rendering a preview has no external effect
  checklist: circuit-breaker-policy dismissed: no downstream dependency is called
  checklist: declared-target-coverage dismissed: there is no fan-out
- signed-out roster previews: A roster's link preview reads the roster as an unauthenticated visitor, so only unlisted and public rosters render.
  over: the roster reads the preview route makes through service.rosterAccess
  via: reads a roster as an unauthenticated visitor
  because: a private roster's preview would publish its army to anyone holding the link
  crossing: product store -> visitor
  refuted: the preview read the roster as a named viewer -> reads a roster as an unauthenticated visitor failed (2026-10-08)
  kinds: read
  checklist: scoped-reads declared as signed-out roster previews
  checklist: redaction dismissed: the route renders a whole roster card or nothing
