# Telemetry

## Privacy

- Event properties never carry names, emails, images, tokens or IDs, search text, unit or list contents, command payloads, rules prose, or error messages; use bounded enums, booleans, counts, durations, and outcomes.
- The only ID is the internal `battle_id` on server battle events, never the URL token. Faction and detachment labels are allowed; catalogue IDs are not.
- Battle refusals carry a `RefusalCode`, never the message. MCP tool failures carry a `ToolErrorType` the result declares through `toolError`, never the error class or message; calls to tool names the server does not register are not captured. Server logs, spans, and metrics use operation names and bounded metadata, never raw URLs or payloads.
- Mark account, security, and administration surfaces `ph-no-capture`. Native screenshot replay stays disabled because it cannot redact the WebView.
- The PostHog project's `Remove MCP Analytics IP` transformation removes the ingestion address; SDK `$ip = null` alone does not.

## Runtime

- Only production sends events. `VITE_POSTHOG_HOST` must be the ingestion host, not a reverse proxy that drops the forwarded visitor address.
- Durable sync captures only on the transaction that newly applies an action, never on retries. A sync answered `refused` or `conflict` returns normally, so it captures `sync_refused` with a bounded `cause`.
- Write events go through `captureMutation` or `captureWrite`, which add `delivery` and, for account agent tools, `via: 'agent'`.
- Keep crawler `$http_log` capture unsampled.
- A server failure no request waits on, such as a scheduled refresh or a push delivery, goes through `reportServerFailure`, which keeps the detail in the server log and sends PostHog only its event name and error class. Server-only modules the warm plugin bundles stay off it, since they cannot import the telemetry adapter.
- A state only the player can resolve on their device, such as reconnecting or reviewing a sync conflict, throws `OfflineRefusal`, which exception capture skips.
- Verify with `e2e/telemetry.spec.ts`; after deployment, inspect real events, since arrival alone proves neither privacy nor identity linkage.
