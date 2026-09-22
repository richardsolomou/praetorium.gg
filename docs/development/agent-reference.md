# Agent reference

Praetorium exposes its public game reference to crawlers and tool-using clients without generating or storing a second interpretation of the rules. The browser pages, HTTP API, MCP endpoint, sitemap, and Markdown responses all read the verified canonical catalogue snapshot.

## Reference corpus

`src/server/referenceCorpus.ts` projects canonical datasheets, detachments, and numbered rules into bounded documents and sections. Every document carries its canonical page URL, source revisions, and attribution. The projection keeps unavailable source fields unavailable and uses the source text without generated summaries.

The canonical snapshot contains detachments beside datasheets and rules. An instance can derive detachments from the same verified source files while it serves a snapshot compiled before that field existed; new snapshot publications write them into `canonical/catalogue.json`.

`src/server/referenceSearch.ts` owns agent retrieval. It searches full reference text and ranks exact names and headings before prose. This is separate from `globalSearch.ts`, whose short grouped results remain tuned for human navigation and deliberately exclude broad rules prose.

`pnpm reference:evaluate` measures the checked-in retrieval fixtures against the active verified snapshot. The fixtures identify stable documents and anchors without copying source prose into Git; the evaluator derives those queries from the snapshot and enforces top-1/top-5 recall, anchor and citation completeness, response size, and cold/warm latency baselines. CI runs it after installing the pinned snapshot.

## HTTP API

The read-only API is rooted at `/api/reference/v1`:

- `GET /search?q=...` searches all reference kinds. `kind`, `faction`, and `limit` narrow the bounded result.
- `GET /factions` lists the available faction filters.
- `GET /datasheets/{catalogueId}/{slug}` reads one canonical datasheet.
- `GET /detachments/{catalogueId}/{slug}` reads one canonical detachment.
- `GET /rules/{documentId}/{sectionId}` reads one rules section.
- `GET /documents/{id}` reads the bounded document named by a search result.
- `GET /openapi.json` describes the contract.

Responses are JSON by default. `Accept: text/markdown` selects a compact source-faithful representation. Reference responses use snapshot-derived ETags, one-hour public caching, bounded inputs and outputs, and an in-process request limit. A missing catalogue returns `503` rather than an empty reference.

## MCP

`POST /mcp` is a stateless Streamable HTTP MCP endpoint. It exposes `search_reference`, `get_reference`, and `list_factions`. The transport is an adapter over the same corpus and search implementation as the HTTP API; it has no account, roster, or battle access.

## Crawlers

`/sitemap.xml` is generated from the active snapshot. `/robots.txt` advertises it, while `/llms.txt` points clients to the human reference, OpenAPI document, and MCP endpoint. Datasheet, detachment, and rules-section routes load their content during server rendering and publish page-specific metadata and canonical links.

Verify crawler-facing changes against the production server output with JavaScript disabled. Hydrated browser content is not evidence that the initial HTML contains the reference.

Run `pnpm reference:verify https://<deployment>` against a deployed revision. It exercises search, JSON and Markdown retrieval, conditional caching, MCP parity, discovery files, and the initial HTML for a datasheet, detachment, and rules section.

## Privacy and attribution

Raw search queries are not sent to telemetry. Every retrieval result identifies its source revisions and includes the attribution required by the upstream sources. Reproducing a result does not remove those upstream licence conditions.
