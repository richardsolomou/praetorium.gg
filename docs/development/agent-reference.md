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

## WebMCP

Supported browsers register the full agent surface through `document.modelContext`: the fourteen MCP tools plus tool equivalents of both resources and both prompts. [`AgentTools`](../../src/server/agentTools.ts) owns shared schemas and handlers; [`referenceAgentContext.ts`](../../src/server/referenceAgentContext.ts) owns resource text and prompt instructions. Keep MCP OAuth separate from browser sessions; `/mcp` still requires bearer tokens for account access.

[`WebMcp`](../../src/client/features/agents/WebMcp.tsx) registers public tools throughout the application and account tools for a signed-in, non-impersonated player. Registration aborts on account changes and unmount. Server calls bind the expected account to the current session, validate bounded input, enforce mutation origin and request limits, and reuse the existing ownership, legality, and battle-sequence checks. Saved-roster tools operate on saved data; they do not edit an unsaved browser draft.

Every browser-agent write validates and normalizes its input before review, resolves owned roster/player names, and shows the exact proposed input alongside a readable summary. Approval expires after two minutes; decline, cancellation, and account changes prevent dispatch. Only one write may await approval or execute per page. Bound server calls to thirty seconds. Never retry a dispatched write automatically: cancellation cannot undo a server mutation and a lost response can leave its result uncertain. Refresh visible data and save the refreshed application snapshot after a write. Keep late responses from a previous account out of the current page.

The approval dialog governs WebMCP handlers, not all browser automation: an agent with control of the browser can click ordinary controls, including approval. Treat tool annotations as hints, not authorization. Tool results can reach the user's assistant provider and contain untrusted source or player text; do not return credentials or report private inputs/results to telemetry.

Feature-detect the API without installing a polyfill in the application. Chrome's experimental API currently requires its WebMCP testing flag or an origin-trial enrollment; browser support and the draft can change. Follow the [imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api) when updating registration signatures. Run `just e2e webmcp.spec.ts webmcp-native.spec.ts` for discovery, sign-in/sign-out, decline, approval, visible refresh, and saved results. The inspector journey executes real server operations for all four write tools, including approval expiry. The native journey enables the browser feature and checks registration, execution, and sign-out against the pinned Chromium API. Chromium 151 omits the execution-options argument and requires JSON-string inputs for `executeTool`; retain page-lifetime cancellation when no per-call signal is supplied.

## Crawlers

`/sitemap.xml`, `/robots.txt`, and `/llms.txt` expose public discovery. Reference content must be in initial server-rendered HTML with absolute canonical/preview URLs, alternate Markdown links where supported, and page-owned breadcrumbs. Child routes must not duplicate parent JSON-LD. [Interface](interface.md#link-previews) owns account-sensitive metadata; [Catalogue data](catalogue-data.md#data-updates) owns measured `lastmod` values.

Public roster canonicals omit parameters; unlisted/frozen lists and sign-in stay `noindex`. Sign-in return links are `nofollow`, and robots disallows sign-in crawls. Reference points/base descriptions include only unconditional source-backed values. [Deployment](../deployment.md) owns IndexNow submission.

`src/contracts/productGuides.ts` owns authored player instructions shared by the public guide pages, navigation search, sitemap and agent discovery. Keep these instructions about product workflows, not a second interpretation of game rules. Verify claims against the builder, importer, simulator and battle flows when changing them. Worked examples use screenshots from `e2e/guide-examples.spec.ts`, stored in `public/guides/`; update the authored example and its image together, with intrinsic image dimensions and descriptive alternative text. Run that journey to verify the examples before replacing images. Public product and guide pages use `pageHead` with parameter-free canonical URLs; the sitemap lists final destinations rather than redirecting entry points. Product-guide and discovery ETags must change with their content even when the catalogue snapshot does not change. Run `just e2e discovery.spec.ts` to check metadata, guide navigation, initial HTML, phone layout and missing-page responses. Unknown rules documents, including encoded route placeholders, must return HTTP 404; document indexes and section pages remain readable on hard requests and client navigation.

## Verification and attribution

Run `pnpm reference:verify https://<deployment>` for discovery, filters/pagination, JSON/Markdown/structured reads, caching, MCP, and initial reference HTML. Verify with JavaScript disabled; hydration is not evidence of crawler access. Every result retains its sources and licence attribution. Never send raw search queries or private content to telemetry.
