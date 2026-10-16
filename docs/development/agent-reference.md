# Agent reference

Browser pages, HTTP, MCP, sitemap, and Markdown responses read one verified canonical snapshot. Do not generate or store another rules interpretation. `src/server/referenceCorpus.ts` projects bounded documents and records; `referenceSearch.ts` ranks agent retrieval separately from navigation search.

## Reference corpus

Preserve canonical URLs, source revisions, attribution, unavailable fields, and source prose; keep geometry in structured records, not excerpts. `pnpm reference:evaluate` checks recall, citations, size, and latency against fixtures that never commit source prose.

## HTTP API

`/api/reference/v1/openapi.json` is the read-only contract; `Accept: text/markdown` or `format=markdown` selects Markdown. Preserve content-derived ETags, public caching, and bounds. A missing, invalid, or revoked snapshot returns `503`, never empty or stale data.

## MCP

`POST /mcp` uses stateless Streamable HTTP; `src/server/referenceMcp.ts` owns tools, resources, and version, and `server.json` the registry entry. Account tools require Better Auth OAuth (`mcp:read`, `mcp:write`) with resource-bound bearer tokens, never browser cookies, and reuse the site's ownership, legality, and sequence checks. `save_roster`'s `limit` is the battle size, with an optional [custom points budget](catalogue-data.md#custom-points-budgets); `create_battle`'s `limit` is only the battle size.

`simulate_combat` ([`combatTools.ts`](../../src/server/combatTools.ts)) runs the standalone simulator flow for two full-strength units. It refuses work above `COMBAT_TOOL_MAX_WORK` because it calculates synchronously on the server, returns uncompilable rules as `notCalculated`, and links to `/simulator` with the same state.

Accept one bounded JSON-RPC message, never batches. SQLite migrations must create OAuth storage before serving. Keep the pinned provider patch for wrapped uniqueness errors during concurrent startup. [Telemetry](telemetry.md#runtime-boundaries) owns MCP telemetry. Publish with `mcp-publisher login github` and `mcp-publisher publish` from the root, keeping registry and server versions aligned.

## WebMCP

[`WebMcp`](../../src/client/features/agents/WebMcp.tsx) registers the [`AgentTools`](../../src/server/agentTools.ts) surface through `document.modelContext`, with account tools only for a signed-in, non-impersonated player. Server calls bind the expected account to the session; MCP OAuth stays separate from browser sessions. Saved-roster tools never edit an unsaved draft.

Writes show the exact normalized input for approval ([`WriteApproval.ts`](../../src/client/features/agents/WriteApproval.ts)); decline, expiry, and account changes prevent dispatch, and one write runs per page. Never retry a dispatched write: cancellation cannot undo it and a lost response leaves its result uncertain. Drop late responses from a previous account.

Approval governs WebMCP handlers, not browser automation: an agent controlling the browser can click approval itself. Annotations are hints, not authorization. Results reach the user's assistant provider and contain untrusted text; never return credentials or send private inputs or results to telemetry.

Feature-detect the API without a polyfill; follow the [imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api) for signatures. Playwright's Chromium 156 passes a per-call signal and requires object inputs for `executeTool`; keep page-lifetime cancellation for browsers that supply no signal. Run `just e2e webmcp.spec.ts webmcp-native.spec.ts`.

## Crawlers

`/sitemap.xml`, `/robots.txt`, and `/llms.txt` expose discovery. Reference content must be in initial server-rendered HTML with absolute canonical URLs; child routes must not duplicate parent JSON-LD. [Interface](interface.md#link-previews) owns account-sensitive metadata, [Catalogue data](catalogue-data.md#data-updates) `lastmod`, and [Deployment](../deployment.md) IndexNow.

Canonicals omit parameters and the sitemap lists final destinations. Unlisted/frozen lists and sign-in stay `noindex`; robots disallows sign-in and sign-in return links are `nofollow`. Reference points include only unconditional source-backed values. Discovery ETags must change with content even when the snapshot does not. Unknown rules documents, including encoded route placeholders, return 404.

`src/contracts/productGuides.ts` owns product instructions; keep them about workflows, not game rules. Guide screenshots come from `e2e/guide-examples.spec.ts`. Run `just e2e discovery.spec.ts` after discovery changes.

## Verification and attribution

Run `pnpm reference:verify https://<deployment>`. Check crawler access with JavaScript disabled; hydration is not evidence. Every result keeps source and licence attribution. Never send raw search queries or private content to telemetry.
