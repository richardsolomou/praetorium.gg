# Agent reference

Browser pages, HTTP, MCP, sitemap, and Markdown responses read one verified canonical snapshot. Do not generate or store another rules interpretation. `src/server/referenceCorpus.ts` projects bounded documents/records; `referenceSearch.ts` ranks agent retrieval separately from human navigation search.

## Reference corpus

Documents cover datasheets, detachments, missions, dispositions/matchups, twists, deployments/terrain, packs, and numbered rules. Preserve canonical URLs, source revisions, attribution, unavailable fields, and source prose. Keep full geometry in structured records rather than search excerpts. Exact names/headings outrank prose; filters and opaque cursors bound retrieval.

`pnpm reference:evaluate` checks snapshot-derived fixtures for recall, anchors/citations, size, and latency. Fixtures identify records without committing source prose.

## HTTP API

`/api/reference/v1/openapi.json` is the contract. The read-only API provides:

| Endpoint                              | Read                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| `/` and `/about`                      | Status, filters, capabilities, and privacy                           |
| `/search`                             | Filtered, paginated full-text retrieval                              |
| `/factions`                           | Faction filters                                                      |
| `/factions/{catalogueId}/units`       | Bounded bulk planning index, with battle-size and detachment context |
| `/datasheets/{catalogueId}/{slug}`    | Canonical datasheet                                                  |
| `/detachments/{catalogueId}/{slug}`   | Canonical detachment                                                 |
| `/rules/{documentId}/{sectionId}`     | Rules section                                                        |
| `/documents/{id}` and `/records/{id}` | Document or structured source-faithful record                        |

JSON is default; `Accept: text/markdown` or `format=markdown` selects Markdown. Preserve content-derived ETags, public caching, input/output bounds, and request limits. A missing, invalid, or revoked snapshot returns `503`, not empty/stale reference data.

## MCP

`POST /mcp` uses stateless Streamable HTTP. `src/server/referenceMcp.ts` owns tools/resources/version; `server.json` describes the official registry entry. Public reference tools need no sign-in. The guide steers planning toward bulk unit reads rather than one call per datasheet.

Account tools require Better Auth OAuth: `mcp:read` for owned-roster/battle reads, `mcp:write` for supported writes. Use the site's ownership, legality, and expected-sequence checks. Resource-bound bearer tokens authorize calls; browser cookies do not. Discovery supports protected-resource/authorization metadata, client metadata and dynamic registration, and refresh tokens through `offline_access`.

Accept one bounded JSON-RPC message, never batches. SQLite migrations must create OAuth storage before serving. Preserve the pinned provider patch for wrapped uniqueness errors during concurrent startup. Anonymous MCP telemetry rules belong to [Telemetry](telemetry.md#runtime-boundaries).

Publish registry changes from the root with `mcp-publisher login github` and `mcp-publisher publish`; keep registry and server versions aligned.

## Crawlers

`/sitemap.xml`, `/robots.txt`, and `/llms.txt` expose public discovery. Reference content must be in initial server-rendered HTML with absolute canonical/preview URLs, alternate Markdown links where supported, and page-owned breadcrumbs. Child routes must not duplicate parent JSON-LD. [Interface](interface.md#link-previews) owns account-sensitive metadata; [Catalogue data](catalogue-data.md#data-updates) owns measured `lastmod` values.

Public roster canonicals omit parameters; unlisted/frozen lists and sign-in stay `noindex`. Sign-in return links are `nofollow`, and robots disallows sign-in crawls. Reference points/base descriptions include only unconditional source-backed values. [Deployment](../deployment.md) owns IndexNow submission.

## Verification and attribution

Run `pnpm reference:verify https://<deployment>` for discovery, filters/pagination, JSON/Markdown/structured reads, caching, MCP, and initial reference HTML. Verify with JavaScript disabled; hydration is not evidence of crawler access. Every result retains its sources and licence attribution. Never send raw search queries or private content to telemetry.
