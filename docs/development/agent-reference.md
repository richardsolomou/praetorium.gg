# Agent reference

`src/server/referenceCorpus.ts` projects one snapshot for pages, HTTP, MCP, sitemap, and Markdown.

## Reference corpus

- Agents get names, numbers, points, computed results, and each rule's VS Data summary as `ruleSummary`, never the official text. `src/server/referenceSummaries.ts` finds a summary the way the page showing that rule does (by its token, its owner's record of its name, or VS Data id), so an agent reads what a player sees. Only a rule with no summary carries `textSources` pointers, and the server never fetches or relays their words. `simulate_combat` calculates from the words in its own snapshot (`serverWords`), and replaces any choice label that quotes a rule.
- MCP account tools (`src/server/referenceMcp.ts`) accept only OAuth bearer tokens, never cookies, and reuse the site's ownership and legality checks. WebMCP approval is not authorization.
- An account tool called without a token answers with a tool error carrying `_meta["mcp/www_authenticate"]`, and every tool declares `securitySchemes`. Never a transport 401 there: clients such as Claude Code then drop the whole server, public tools included. Only a token that fails verification gets the 401.
- `plugin/skills` is the one copy of the agent skills: the plugin ships them, and the MCP server serves them as prompts and through `get_skill`. Skill text teaches workflow and construction rules the builder enforces, never rules prose; skills point agents at `ruleSummary` for what a rule does.
- `create_battle` with nobody named starts a draft through the same `startDraftBattle` as New battle and returns its join link, so an agent never seats an opponent the site would not.
- `send_feedback` and `list_my_feedback` reach PostHog Support through the widget API with the same identity proof as the browser (`posthogSupportInbox`), so conversations land on the player's Support page. Only an instance with `POSTHOG_SUPPORT_IDENTITY_SECRET`, which is production alone, reaches Support; everywhere else they refuse, so never set that secret while testing.
- Every MCP tool declares a `title` and explicit `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
- Reference content must be in server-rendered HTML: `pnpm reference:verify https://<deployment>`.

## Publishing

- MCP registry: `mcp-publisher login github`, then `mcp-publisher publish`, keeping `server.json` and the server version aligned.
- ChatGPT: after any plugin change, `just plugin-zip` and upload `dist/praetorium-plugin.zip` by hand.
- Claude: bump `version` in both `plugin/.claude-plugin/plugin.json` and `plugin/plugin.json`, then run `claude plugin validate ./plugin`.
