# Reference API

The versioned, read-only public reference API over the active catalogue snapshot: factions, datasheets, detachments, rule documents, records and search.

## entrances

- route api/reference/v1/about: a client reads the API's attribution and active catalogue snapshot
  handler: Route in src/routes/api/reference/v1/about.ts
  trust: visitor
- route api/reference/v1/datasheets.$catalogueId.$slug: a client reads one datasheet
  handler: Route in src/routes/api/reference/v1/datasheets.$catalogueId.$slug.ts
  trust: visitor
- route api/reference/v1/detachments.$catalogueId.$slug: a client reads one detachment
  handler: Route in src/routes/api/reference/v1/detachments.$catalogueId.$slug.ts
  trust: visitor
- route api/reference/v1/documents.$id: a client reads one rule document's outline
  handler: Route in src/routes/api/reference/v1/documents.$id.ts
  trust: visitor
- route api/reference/v1/factions.$catalogueId.units: a client reads a faction's unit costs, composition and limits
  handler: Route in src/routes/api/reference/v1/factions.$catalogueId.units.ts
  trust: visitor
- route api/reference/v1/factions: a client lists factions
  handler: Route in src/routes/api/reference/v1/factions.ts
  trust: visitor
- route api/reference/v1/index: a client discovers the API's resources
  handler: Route in src/routes/api/reference/v1/index.ts
  trust: visitor
- route api/reference/v1/openapi[.]json: a client reads the OpenAPI description
  handler: Route in src/routes/api/reference/v1/openapi[.]json.ts
  trust: visitor
  control: none — the static public description of a read-only API
- route api/reference/v1/records.$id: a client reads one reference record by id
  handler: Route in src/routes/api/reference/v1/records.$id.ts
  trust: visitor
- route api/reference/v1/rules.$documentId.$sectionId: a client reads one rule section
  handler: Route in src/routes/api/reference/v1/rules.$documentId.$sectionId.ts
  trust: visitor
- route api/reference/v1/search: a client searches reference source text
  handler: Route in src/routes/api/reference/v1/search.ts
  trust: visitor

## invariants

- rate-limited reference reads: A reference read beyond a client's per-minute allowance is refused with 429.
  over: the reference reads referenceRateLimit admits, keyed by the address the edge forwards
  via: rate limits individual reference reads
  because: the reference API is public and unauthenticated; without a per-client allowance one caller can exhaust the catalogue search and compile work every reader shares
  crossing: visitor -> verified catalogue
  refuted: referenceRateLimit admitted one read past the allowance -> rate limits individual reference reads failed (2026-10-08)
  kinds: budget
  checklist: bounded-admission declared as rate-limited reference reads
  checklist: fair-admission dismissed: each client has its own allowance; there is no shared queue to order
  checklist: rate-budget declared as rate-limited reference reads
  checklist: memory-budget dismissed: the bucket table's own bound is tested by bounds unique rate-limit buckets and recovers after the window, outside this bullet
  checklist: execution-budget dismissed: each read is a bounded lookup over the loaded snapshot
  checklist: circuit-breaker-policy dismissed: reads call no downstream dependency
