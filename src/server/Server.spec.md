# Server

Application services, authentication, catalogue loading and projection, the agent tools, and the SpacetimeDB repository.

## invariants

- bounded MCP combat work: An anonymous combat estimate refuses an attack whose exact calculation would exceed COMBAT_TOOL_MAX_WORK instead of computing it.
  over: the matchups simulateCombat receives, an ordinary squad pairing and one whose modifiers push the calculation past the bound
  via: refuses an attack larger than the server calculation bound
  because: the estimate runs synchronously on the shared server for anyone who calls /mcp or WebMCP; without the bound one large attack held the event loop for about 4.5 seconds in the test that now refuses it
  crossing: agent -> verified catalogue
  kinds: budget
  checklist: bounded-admission dismissed: no concurrency ceiling is claimed; the shared reference rate limit admits calls
  checklist: fair-admission dismissed: there is no shared queue
  checklist: rate-budget dismissed: the per-address reference rate limit applies to every MCP call and is not checked by this bullet
  checklist: memory-budget dismissed: input size, models and attached units are schema-bounded; this bullet bounds steps, not allocation
  checklist: execution-budget declared as bounded MCP combat work
  checklist: circuit-breaker-policy dismissed: no downstream dependency is called
