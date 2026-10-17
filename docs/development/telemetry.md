# Telemetry

PostHog is optional: every product path works without its variables. `src/posthog.ts` owns browser configuration and event context, `src/adapters/posthog.ts` server lifecycle, and `src/adapters/mcpAnalytics.ts` and `src/server/crawlerRequests.ts` anonymous agent/crawler capture. Capture sites and adjacent tests are the event inventory.

## Runtime boundaries

Browsers send through the same-origin `/t` proxy, which drops cookies and forwards the visitor address; `VITE_POSTHOG_HOST` must be the ingestion host, not a managed reverse proxy that discards that header. Only production sends events: previews and browser tests run without the telemetry variables, local dev servers load the SDK only in a production bundle, and only production has a server project token.

The WebView browser owns product events, identified replay, logs, and metrics. Mask every form input and mark account, security, and administration surfaces `ph-no-capture`. The Expo client captures only shell lifecycle and errors; native screenshot replay stays disabled because it cannot redact the WebView DOM.

Server logs, spans, and request metrics use stable operation or server-function names and bounded metadata, never raw URLs or payloads. In the `process.*` gauges from `src/server/runtimeMetrics.ts`, ArrayBuffer bytes are already part of external memory; do not add the two.

Public crawler `$http_log` capture allows only reference/discovery paths without account or opaque object IDs, strips query strings, keeps only the referrer origin, disables GeoIP, and creates no person profile; its salted identities are day-scoped. Because Cloudflare caches signed-out pages ([Deployment](../deployment.md#runtime)), these logs count origin renders, not reads.

MCP Analytics keeps anonymous tool names, timings, outcomes, and protocol/deployment metadata, never arguments, results, intent, client identifiers, or exceptions. The project's `Remove MCP Analytics IP` transformation removes the address added at ingestion; SDK `$ip = null` alone does not prove removal.

## Event contract

Custom events measure starts, attempts, completed actions, and bounded failures; ordinary navigation and clicks stay autocaptured. Meanings that are easy to misread:

- `account_signed_in` fires after two-factor checks, so a pending challenge is not a sign-in; a signup produces only `account_created`.
- `roster_created` can be an empty row or a claimed guest draft; use `roster_unit_added` to measure building. Durable sync emits roster creation/deletion only on the transaction that applies the lifecycle change.
- `roster_imported` means parsed and `guest_roster_imported` means opened as a local draft; `roster_import_saved` and `guest_roster_saved` mean saved, and retries can repeat a guest completion, so count unique people.
- `roster_priced` and `roster_datasheet_loaded` come from the server, or from the browser when the device answers the read from its download (`constructionReadEvents` in `src/client/offline/constructionReads.ts`); both build their properties with `src/shared/rosterTelemetry.ts`, and `duration_ms` is where the work ran.
- Roster `unit_count` counts an attached character and bodyguard as one unit; request metrics and import `pick_count` count payload picks.
- `detachment_rules_covered` requires every selected detachment, including imported options, to resolve to supported Game Datacards semantics.
- `battle_command_submitted` refusals carry a `RefusalCode` from `src/core/battle.ts`, never the message; read it with `command`, since codes are shared across kinds. `unclassified` is a refusal the server's rules did not reproduce, expected only while releases overlap. `set-setup-step` appears only for battles set up before the one-page setup.
- Measure spectator invite conversion as unique people from `spectator_invite_followed` to `guest_roster_started`, `account_created`, or `battle_creation_submitted`; a battle finishing while watched can repeat `shown`.
- `collection_photo_screened` and `profile_picture_screened` carry TypeSafe Jev probabilities per question in `src/server/photoScreening.ts`, or an `outcome` of `unreadable` or `failed`. They decide nothing yet; choose thresholds from them before acting on uploads, and compare only rows from the same `model`.
- `reference` (`datasheet` or `detachment`) marks flows begun on a reference page; measure reference conversion with it, not destination pageviews.

Browser events receive bounded `feature` and `surface` at the send boundary; route parameters never enter `feature`, and server/native-shell events do not inherit them. Web vitals use the measured `$current_url`, since later SPA navigation can change `$pathname`.

## Privacy boundary

Signed-in browsers identify with the account ID, and `PostHogBetterAuthIdentity` in `AppShell.tsx` sets the account's `name` and `email` as person properties for support. Event properties never carry names, emails, images, opaque tokens or IDs, search text, unit/list contents, command payloads, rules prose, or error messages; use bounded enums, booleans, counts, durations, and outcomes. Source-normalized faction/detachment labels are allowed; catalogue IDs are not.

The one exception is the automatic import report. When `roster_import_failed` fires, or `roster_import_review_required` has unmatched or unplaced entries, `RosterImport.tsx` files an App feedback response (`importFailureReport` in `src/client/features/feedback/feedback.ts`) whose message deliberately carries the unmatched and unplaced lines and the exact pasted text or exchange code, truncated below the SDK's 65,535-character string limit, so the failure can be reproduced. The `roster_import_*` events stay free of list contents.

Exception tracking may carry stack traces; manual captures add only an operation label. React only logs errors caught by the router's error page, so `defaultOnCatch` in `src/router.tsx` reports them. `src/client/networkErrors.ts`, `src/client/realtimeErrors.ts`, and their callers decide which failures are expected and excluded.

## Feedback

`src/client/features/feedback` answers the API survey [App feedback](https://us.posthog.com/project/548119/surveys/01a14042-306c-0000-f070-c4fc0aadccf2) with a `survey sent` event whose question ids are pinned in `feedback.ts`; changing the survey's questions means updating them there. Without a successful capture, the dialog keeps the message and offers the issue tracker; local and browser-test stacks always take that path unless a test stubs capture.

Screenshots go to the private `praetorium-private` R2 bucket (production reaches it with the backup credentials) and only administrators can open their links. After capture, `emailFeedback` emails every admin account through the auth SMTP delivery; a failed delivery never changes what the player sees, since capture is the record.

## Source maps

Hosted web builds upload hidden maps and bundles, including workers, before image publication; chunk-ID injection participates in asset hashing. Upload credentials are BuildKit secrets, and missing configuration or upload failure stops hosted builds. Containers ship no public maps. iOS uses the Expo/Metro plugins; see [PostHog's CLI documentation](https://posthog.com/docs/error-tracking/upload-source-maps/cli) for scopes and [Mobile release](mobile-release.md#build-and-upload) for delivery.

## Measuring success

Count unique people for conversion and retention, attempts for friction, and completed actions for use; funnels measure people, not objects, because object IDs are excluded. Absence of an event indicates drop-off only after deployment and within a defined window.

## Saved dashboards

- [Feature adoption](https://us.posthog.com/project/548119/dashboard/2162146)
- [Conversion and drop-off](https://us.posthog.com/project/548119/dashboard/2162147)
- [Player retention](https://us.posthog.com/project/548119/dashboard/2162148)

These use the project's internal/test-account filters, and acquisition views add the production host filter. Initial channel type is first acquisition, not a later visit's channel. Inspect each saved insight for its definition and window rather than copying configuration here.

## Verification

`e2e/telemetry.spec.ts` and adjacent tests cover event boundaries and excluded data. After deployment, inspect real events, guest-to-account identity linkage, host filtering, map resolution, replay masking, and MCP IP removal before claiming the integration works; event arrival alone proves neither privacy nor correct conversion.
