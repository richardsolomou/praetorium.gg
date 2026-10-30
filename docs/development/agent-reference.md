# Agent reference

`src/server/referenceCorpus.ts` projects one snapshot for pages, HTTP, MCP, sitemap, and Markdown.

## Reference corpus

- Agents get names, numbers, points, and computed results, never rules text; only `textSources` pointers. The server never fetches or relays the words.
- MCP account tools (`src/server/referenceMcp.ts`) accept only OAuth bearer tokens, never cookies, and reuse the site's ownership and legality checks. WebMCP approval is not authorization.
- Every MCP tool declares a `title` and explicit `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
- Reference content must be in server-rendered HTML: `pnpm reference:verify https://<deployment>`.

## Publishing

- MCP registry: `mcp-publisher login github`, then `mcp-publisher publish`, keeping `server.json` and the server version aligned.
- ChatGPT: after any plugin change, `just plugin-zip` and upload `dist/praetorium-plugin.zip` by hand.
- Claude: bump `version` in both `plugin/.claude-plugin/plugin.json` and `plugin/plugin.json`, then run `claude plugin validate ./plugin`.
