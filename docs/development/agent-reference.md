# Agent reference

Praetorium exposes its public game reference to crawlers and tool-using clients without generating or storing a second interpretation of the rules. The browser pages, HTTP API, MCP endpoint, sitemap, and Markdown responses all read the verified canonical catalogue snapshot.

## Reference corpus

`src/server/referenceCorpus.ts` projects canonical datasheets, detachments, primary and secondary missions, Force Dispositions, mission twists, deployments, terrain layouts, mission packs, and numbered rules into bounded documents and sections. Mission-pack documents include the complete ordered Force Disposition matrix and the source-backed scoring, actions, and limits behind each matchup. Every document carries its canonical page URL, source revisions, and attribution. The projection keeps unavailable source fields unavailable and uses the source text without generated summaries. Exact deployment and terrain geometry remains available through structured records without bloating search excerpts.

The canonical snapshot contains detachments beside datasheets and rules. An instance can derive detachments from the same verified source files while it serves a snapshot compiled before that field existed; new snapshot publications write them into `canonical/catalogue.json`.

`src/server/referenceSearch.ts` owns agent retrieval. It searches full reference text, ranks exact names and headings before prose, paginates with an opaque cursor, and supports faction, mission-pack, rule-document, and kind filters. This is separate from `globalSearch.ts`, whose short grouped results remain tuned for human navigation and deliberately exclude broad rules prose.

`pnpm reference:evaluate` measures the checked-in retrieval fixtures against the active verified snapshot. The fixtures identify stable documents and anchors without copying source prose into Git; the evaluator derives those queries from the snapshot and enforces top-1/top-5 recall, anchor and citation completeness, response size, and cold/warm latency baselines. CI runs it after installing the pinned snapshot.

## HTTP API

The read-only API is rooted at `/api/reference/v1`:

- `GET /` lists the active revisions, kinds, factions, mission packs, and rule documents.
- `GET /about` explains Praetorium's capabilities, privacy boundaries, data model, and recommended agent workflow.
- `GET /search?q=...` searches all reference kinds. `kind`, `faction`, `pack`, `document`, `limit`, and `cursor` narrow or paginate the bounded result.
- `GET /factions` lists the available faction filters.
- `GET /factions/{catalogueId}/units` returns a compact bulk roster-planning index with unit-size costs, composition, attachment relationships, limits, roles, keywords, and canonical links. `battleSize` applies size-dependent limits and `detachment` includes that detachment's complete rules and options.
- `GET /datasheets/{catalogueId}/{slug}` reads one canonical datasheet.
- `GET /detachments/{catalogueId}/{slug}` reads one canonical detachment.
- `GET /rules/{documentId}/{sectionId}` reads one rules section.
- `GET /documents/{id}` reads the bounded document named by a search result.
- `GET /records/{id}` reads the source-faithful structured record behind a document, including mission cards and setup geometry.
- `GET /openapi.json` describes the contract.

Responses are JSON by default. `Accept: text/markdown` selects a compact source-faithful representation. Reference responses use content-derived ETags, one-hour public caching, bounded inputs and outputs, and an in-process request limit. A missing, invalid, or revoked catalogue returns `503` rather than an empty or stale reference.

## MCP

`POST /mcp` is a stateless Streamable HTTP MCP endpoint. It exposes `list_reference`, `list_factions`, `list_units`, `search_reference`, `get_reference`, and `get_reference_record`. Every tool declares read-only, non-destructive, idempotent annotations. Server instructions and the `praetorium://guide` resource explain the product and steer roster-planning agents toward one `list_units` call instead of a datasheet-by-datasheet crawl. `praetorium://reference-status` reports the active reference catalogue, while the bundled prompts guide rules questions and mission-matchup explanations.

The transport accepts one JSON-RPC message of at most 64 KiB per request and rejects batches. It is an adapter over the same services as the HTTP API; it has no account, saved-roster, private-battle, or mutation access.

## Crawlers

`/sitemap.xml` is generated from the active snapshot. `/robots.txt` advertises it, while `/llms.txt` points clients to the product guide, reference index, bulk unit endpoint, OpenAPI document, and MCP endpoint. Datasheet, detachment, mission-pack, secondary-mission, mission-matchup, and rules-section routes load their content during server rendering and publish page-specific metadata and canonical links. Battles, saved lists and player profiles also publish link-preview metadata and a card image for readers without an account; [Interface](interface.md#link-previews) describes what each reveals.

Verify crawler-facing changes against the production server output with JavaScript disabled. Hydrated browser content is not evidence that the initial HTML contains the reference.

Run `pnpm reference:verify https://<deployment>` against a deployed revision. It exercises discovery, filtered and paginated search, JSON and Markdown retrieval, structured records, bulk units, conditional caching, MCP tools and resources, and the initial HTML for a datasheet, detachment, mission pack, secondary mission, mission matchup, and rules section.

## Privacy and attribution

Raw search queries are not sent to telemetry. Every retrieval result identifies its source revisions and includes the attribution required by the upstream sources. Reproducing a result does not remove those upstream licence conditions.
