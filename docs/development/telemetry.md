# Telemetry

## Privacy

- Event properties never carry names, emails, images, tokens or IDs, search text, unit or list contents, command payloads, rules prose, or error messages; use bounded enums, booleans, counts, durations, and outcomes.
- The only ID is the internal `battle_id` on server battle events, never the URL token. Faction and detachment labels are allowed; catalogue IDs are not.
- Battle refusals carry a `RefusalCode`, never the message. MCP tool failures carry a `ToolErrorType` the result declares through `toolError`, never the error class or message; calls to tool names the server does not register are not captured. Server logs, spans, and metrics use operation names and bounded metadata, never raw URLs or payloads.
- `rules_text_load_failed` carries `file_url`, the pinned public upstream file that failed. It names no reader, and it is the only way to find a missing file.
- A query parameter that holds a secret, such as a reset token or an MCP consent request's OAuth state, goes in `PRIVATE_URL_PARAMS` in `src/posthog.ts`, which masks it in browser event URLs, replay, exception stacks, and logs.
- Mark account, security, and administration surfaces `ph-no-capture`. Native screenshot replay stays disabled because it cannot redact the WebView.
- The PostHog project's `Remove MCP Analytics IP` transformation removes the ingestion address; SDK `$ip = null` alone does not.

## Runtime

- Only production sends events. `VITE_POSTHOG_HOST` must be the ingestion host, not a reverse proxy that drops the forwarded visitor address.
- Durable sync captures only on the transaction that newly applies an action, never on retries. A sync answered `refused` or `conflict` returns normally, so it captures `sync_refused` with a bounded `cause`.
- Write events go through `captureMutation` or `captureWrite`, which add `delivery` and, for account agent tools, `via: 'agent'`.
- `battle_created` means a battle with every place filled: at creation for one that names its players, and when a draft's last army is chosen (`draft: true`) for one started alone, only the first time it is listed (`listed` on `submit_battle`), so a battle reopened by removing a player is not created twice. Starting a draft is `battle_draft_started` and joining one through its link is `battle_joined`, so drafts nobody joins never count as battles.
- Keep crawler `$http_log` capture unsampled.
- Page renders and API routes record `http_server.requests` and `http_server.duration` by route pattern (`/battles/$token`, never the address), and a request that took 5 seconds or more or that the server failed also logs a `slow request` or `request failed` warning. Those warnings are the request history to search after an incident; server functions record `server_function.*` instead.
- A server failure no request waits on, such as a scheduled refresh or a push delivery, goes through `reportServerFailure`, which keeps the detail in the server log and sends PostHog only its event name and error class. Server-only modules the warm plugin bundles stay off it, since they cannot import the telemetry adapter.
- A state only the player can resolve on their device, such as reconnecting or reviewing a sync conflict, throws `OfflineRefusal`, which exception capture skips.
- Verify with `e2e/telemetry.spec.ts`; after deployment, inspect real events, since arrival alone proves neither privacy nor identity linkage.

## Campaign links

- A link to praetorium.gg that is posted outside the app carries `utm_source` (the site that shows it, such as `github` or `discord`), `utm_medium` (the kind of placement, such as `profile` or `community`), and `utm_campaign` (one placement, such as `readme` or `release-0-221-7`). The README links and `scripts/announceDiscord.ts` follow this.
- Values use lowercase letters, digits, and hyphens, and never carry a name, handle, or email. Use plain links, not a tracking shortener.
- Do not tag links inside the app or links to other sites: no Praetorium page reads them.
- A push notification's page carries `utm_source=praetorium-app`, `utm_medium=push` (app) or `web-push` (browser), and the notice kind as `utm_campaign`, which measures opens without a native release.
- The browser SDK puts the tags on the landing `$pageview`, adds `$session_entry_utm_*` to each event of that session, and sets `$initial_utm_*` on the person at sign-in. Server events such as `account_created` and `roster_created` carry no tags, so break them down by the person's `$initial_utm_source` and `$initial_utm_campaign`. A funnel that starts with a browser event can break down by `$session_entry_utm_source` with first-touch attribution, which also counts visitors who never sign up.
