# Telemetry

PostHog is optional: every product path works without its variables. `src/posthog.ts` owns browser configuration and event context; `src/adapters/posthog.ts` owns server lifecycle; `src/adapters/mcpAnalytics.ts` and `src/server/crawlerRequests.ts` own anonymous agent/crawler capture. Capture sites and adjacent tests are the event inventory.

## Runtime boundaries

Browsers send through the same-origin `/t` proxy, which drops cookies and forwards the visitor address. `VITE_POSTHOG_HOST` must be the ingestion host, not a managed reverse proxy that discards that forwarding header. Filter `$host = praetorium.gg` to exclude previews/local stacks sharing the project. Browser test stacks clear telemetry variables.

The WebView browser owns product events, identified replay, logs, and metrics. Mask every form input and exclude account, security, and administration surfaces with `ph-no-capture`. The Expo client captures shell lifecycle/errors separately; native screenshot replay stays disabled because it cannot redact the WebView DOM.

Server logs/spans use stable operation names and bounded metadata. Request metrics use method/outcome, not raw URLs or payloads. Preserve validated browser-session propagation and the shared shutdown path.

Public crawler `$http_log` capture allows only reference/discovery paths without account or opaque object IDs. Strip query strings, use referrer origin only, disable GeoIP, and create no person profile. Day-scoped salted identities do not link across days/restarts. Human browser reads may produce both these logs and pageviews.

MCP Analytics retains anonymous tool names, timings, outcomes, and protocol/deployment metadata. Strip arguments, results, intent, client identifiers, and exception events. The project's `Remove MCP Analytics IP` transformation removes the address added at ingestion; SDK `$ip = null` alone does not prove removal.

## Event contract

Custom events measure starts, attempts, completed actions, and bounded failures. Ordinary navigation/clicks remain autocaptured. Server-confirmed creation is distinct from opening/submitting a form; parsing an import is distinct from saving it. Search settles consecutive queries and reports recovery without repeating a successful refetch. Query text never enters properties.

Important count/identity meanings:

- `account_created` comes from confirmed account creation; `account_signed_in` comes from the final authentication hook after two-factor checks. A signup produces creation only; returning through a signup form still produces sign-in. A pending two-factor challenge is not a sign-in. Browser starts/failures retain intent and redirect context. Completions use the account identity and deployment host, without duplicating client events.
- `roster_created` can mean an empty saved row or claimed guest draft; require `roster_unit_added` to measure building.
- `roster_imported` means parsing. `roster_import_saved` and `guest_roster_saved` mean the request succeeded; uncertain-response retries can repeat a guest completion. Use unique people for conversion.
- Roster `unit_count` counts attached character/bodyguard as one fielded unit through `attachedUnitCount`. Request metrics and import `pick_count` count payload picks instead.
- `detachment_rules_covered` requires every selected detachment to resolve to supported Game Datacards semantics, including imported options. Missing selections remain uncovered.
- `battle_command_submitted` includes kind/outcome, not the command payload. Appended `set-setup-step` commands measure reached setup steps.
- Onboarding stores/captures reading-tour answers, skips, and welcome; domain-derived progress does not emit a duplicate completion event.
- Simulator open/completion/failure are bounded per mounted session/matchup, with `source` identifying standalone, roster, or battle.
- `spectator_invite_shown`, `spectator_invite_followed`, and `spectator_invite_dismissed` measure the invitation a battle shows a reader without a seat; `offer` and `action` name the roster or battle step. Measure conversion as unique people from `spectator_invite_followed` to `guest_roster_started`, `account_created`, or `battle_creation_submitted`. A battle finishing while watched moves the invitation and can repeat `shown`.

Browser events receive bounded `feature` and `surface` at the send boundary. Detail route parameters never enter `feature`; `surface` distinguishes web and native WebView. Web vitals use the measured `$current_url`, since later SPA navigation can change `$pathname`. Historical queries must use that measured path. Server/native-shell events do not inherit these browser properties.

## Privacy boundary

Custom properties exclude names, emails, images, opaque tokens/IDs, search text, unit/list contents, command payloads, rules prose, and error messages. Use bounded enums, booleans, counts, durations, and outcomes. Source-normalized faction/detachment labels are allowed roster dimensions; catalogue IDs are not.

Exception tracking may carry stack traces; manual captures add only an operation label. Expected realtime/network recovery and supported retry statuses are excluded. Unexpected connection errors report once per mounted outage and reset only after a sustained applied subscription. Read `src/client/networkErrors.ts`, `src/client/realtimeErrors.ts`, and their callers for classification; keep sibling paths consistent.

## Source maps

Web builds upload hidden maps and bundles, including workers, before image publication using the pinned PostHog tooling. Chunk-ID injection participates in asset hashing. Upload credentials use BuildKit secrets; missing configuration or upload failure stops hosted builds. Public maps are removed from all container builds. Preview/local builds need no upload credential, and old unuploaded bundles remain unresolved.

iOS uses the Expo/Metro plugins; canary uses dry-run credentials. See [PostHog's CLI documentation](https://posthog.com/docs/error-tracking/upload-source-maps/cli) for scopes and [Mobile release](mobile-release.md#build-and-upload) for delivery.

## Measuring success

Count unique people for conversion/retention, attempts for friction, and completed actions for use. These funnels measure people, not individual rosters/battles/leagues, because object IDs are excluded and different players may complete battle steps. Absence after deployment and within a defined window may indicate drop-off; an undeployed event or closed tab does not prove abandonment.

The browser anonymous identity links at sign-in; server completions use the authenticated account ID. Verify that linkage and duplicate behavior with a real guest-to-authenticated save after deployment. Event arrival alone proves neither privacy nor correct conversion.

## Saved dashboards

- [Feature adoption](https://us.posthog.com/project/548119/dashboard/2162146)
- [Conversion and drop-off](https://us.posthog.com/project/548119/dashboard/2162147)
- [Player retention](https://us.posthog.com/project/548119/dashboard/2162148)

These use the project's internal/test-account filters. The meaningful-activity action excludes pageviews, authentication, administration, loading/pricing, errors, and MCP traffic. Funnels use ordered unique people; retention uses observed weekly returns, with recent/current cohorts incomplete. Inspect the saved insight for its current window rather than copying dashboard configuration here.

## Verification

Use adjacent telemetry tests and `e2e/telemetry.spec.ts` for event boundaries/counts and excluded data. After deployment, inspect real events, identity linkage, host filtering, map resolution, replay masking, and MCP IP removal before claiming the integration works.
