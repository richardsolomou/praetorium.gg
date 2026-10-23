# Agent reference

Browser pages, HTTP, MCP, sitemap, and Markdown responses read one verified canonical snapshot. Do not generate or store another rules interpretation. `src/server/referenceCorpus.ts` projects bounded documents and records; `src/server/referenceSearch.ts` ranks agent retrieval separately from navigation search (`src/core/referenceSearch.ts`).

## Reference corpus

Preserve canonical URLs, source revisions, attribution, and unavailable fields; keep geometry in structured records, not excerpts. Agents get names, numbers, points, and computed results, never rules text: the corpus, the API, and agent tools carry no [tokens](catalogue/sources.md#published-rules-text) and no words. Where text is withheld, `textSources` pointers (`withTextPointers` in `src/shared/sourceText.ts`) name the pinned upstream file instead. The server never fetches or relays the words. `scripts/agentText.integration.test.ts` walks every public tool and the reference API over the installed snapshot and fails on any source sentence, token, or pointer that misses its file. `pnpm reference:evaluate` checks recall, citations, size, and latency against fixtures that never commit source prose.

## HTTP API

`/api/reference/v1/openapi.json` is the read-only contract; `src/server/referenceApi.test.ts` pins its representations, ETags, bounds, and unavailable-snapshot `503`.

## MCP

`POST /mcp` uses stateless Streamable HTTP; `src/server/referenceMcp.ts` owns tools, resources, and version, and `server.json` the registry entry. Account tools require Better Auth OAuth (`mcp:read`, `mcp:write`) with resource-bound bearer tokens, never browser cookies, and reuse the site's ownership, legality, and sequence checks. `save_roster`'s `limit` is the battle size, with an optional [custom points budget](catalogue/construction.md#custom-points-budgets); `create_battle`'s `limit` is only the battle size.

`src/server/agentLinks.ts` makes MCP citations absolute for the configured public origin. Verify the actual assistant's returned link, not only its answer text.

[Telemetry](telemetry.md#runtime-boundaries) owns MCP telemetry. Publish with `mcp-publisher login github` and `mcp-publisher publish` from the root, keeping registry and server versions aligned.

## Assistant directories

The same `/mcp` server is listed in the ChatGPT plugin directory and Claude's Connectors Directory. Every tool needs a `title` and explicit `readOnlyHint`, `destructiveHint`, and `openWorldHint` annotations; `AgentTools` copies the title into `annotations.title`, which Claude's directory reads. Write tools are open-world because rosters and battles can be public, and OpenAI's scan flags writes that can publish but aren't marked open-world. Both directories scan the live server, so tool changes reach the listings without resubmission.

[`plugin/`](../../plugin) is one plugin folder for both directories. `skills/` holds task skills that both load; keep them to workflow steps and decisions, since the server instructions already carry the general tool guidance. For ChatGPT, `plugin.json` holds the listing and review test cases, and `mcp.json` the server with `mixed` auth, so users can install without signing in and ChatGPT offers to connect an account when a roster or battle tool needs one. The published Agent Plugins schema rejects that `extensions.com.openai` block, but OpenAI's portal reads it. `just plugin-zip` writes `dist/praetorium-plugin.zip`, adding the app icon as its logo, for upload at [OpenAI's plugin portal](https://platform.openai.com/plugins); listing, skill, or test-case edits need a new upload. The portal's domain challenge is served from `/.well-known/openai-apps-challenge`. For Claude, `.claude-plugin/plugin.json` makes the folder a plugin bundle, which the directory rescans on each commit to the branch it follows, paired with the MCP connector listing at [claude.ai/directory/manage](https://claude.ai/directory/manage); raise its `version` with each change and run `claude plugin validate ./plugin`. Claude's validator flags symbolic links in a bundle, so keep `plugin/` to regular files.

Gemini has no directory for third-party MCP servers; [Connect an assistant](../../src/client/features/docs/content/connect-an-assistant.md) covers adding the server as a Gemini custom app. When a listing is published or moves, update that assistant's steps there.

Reviewers sign in to production as the [review account](mobile-release.md#review-access), so keep its rosters and battles intact while a review is open.

## WebMCP

[`WebMcp`](../../src/client/features/agents/WebMcp.tsx) registers the [`AgentTools`](../../src/server/agentTools.ts) surface through `document.modelContext`; MCP OAuth stays separate from browser sessions. Saved-roster tools never edit an unsaved draft.

Approval governs WebMCP handlers, not browser automation: an agent controlling the browser can click approval itself. Annotations are hints, not authorization. Results reach the user's assistant provider and contain untrusted text; never return credentials.

Feature-detect the API without a polyfill; follow the [imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api) for signatures. Playwright's Chromium 156 requires object inputs for `executeTool`. Run `just e2e webmcp.spec.ts webmcp-native.spec.ts`.

## Crawlers

`/sitemap.xml`, `/robots.txt`, and `/llms.txt` expose discovery. Reference content must be in initial server-rendered HTML with absolute canonical URLs; child routes must not duplicate parent JSON-LD. [Interface](interface/surfaces.md#link-previews) owns account-sensitive metadata, [Catalogue data](catalogue/rules-versions.md#data-updates) `lastmod`, and [Deployment](../deployment.md) IndexNow.

Canonicals omit parameters. Sign-in stays `noindex` and sign-in return links are `nofollow`. Reference points include only unconditional source-backed values.

Faction documents use the advertised faction metadata and `factionReferenceHref` for their selected rules version; their lookup IDs stay stable. Search, unit and simulator citations follow those document URLs.

Run `just e2e discovery.spec.ts` after discovery changes.

## Verification and attribution

Run `pnpm reference:verify https://<deployment>`. Check crawler access with JavaScript disabled; hydration is not evidence. Every result keeps source and licence attribution.

The deployment verifier searches mission names and checks structured setup records and published source pointers. It must not require withheld wording in search results or retrieved documents.
