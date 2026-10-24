# Telemetry

PostHog is optional: every product path works without its variables. `src/posthog.ts` owns browser configuration and event context, `src/adapters/posthog.ts` server lifecycle, and `src/adapters/mcpAnalytics.ts` and `src/server/crawlerRequests.ts` anonymous agent/crawler capture. Capture sites and adjacent tests are the event inventory.

## Runtime boundaries

Browsers send through the same-origin `/t` proxy, which drops cookies and forwards the visitor address; `VITE_POSTHOG_HOST` must be the ingestion host, not a managed reverse proxy that discards that header. Only production sends events: previews and browser tests run without the telemetry variables, local dev servers load the SDK only in a production bundle, and only production has a server project token.

The WebView browser owns product events, identified replay, logs, and metrics. Mark account, security, and administration surfaces `ph-no-capture`. The Expo client captures only shell lifecycle and errors; native screenshot replay stays disabled because it cannot redact the WebView DOM.

Server logs, spans, and request metrics use stable operation or server-function names and bounded metadata, never raw URLs or payloads. A server function that throws a `Response`, such as the sign-in refusal of an account read, records outcome `error` with no exception, so the browser must not call account reads for a visitor. In the `process.*` gauges from `src/server/runtimeMetrics.ts`, ArrayBuffer bytes are already part of external memory; do not add the two.

Server telemetry resources carry `deployment.host` from the public `APP_URL`. Older spans lack it and can mix deployed instances; do not infer a production hostname from `deployment.environment` alone.

Keep public crawler `$http_log` capture unsampled for crawler diagnostics. Because Cloudflare caches signed-out pages ([Deployment](../deployment.md#runtime)), these logs count origin requests, not all reads or people. They do not measure user harm or cost savings.

The project's `Remove MCP Analytics IP` transformation removes the address added at ingestion; SDK `$ip = null` alone does not prove removal.

## Event contract

Custom events measure starts, attempts, completed actions, and bounded failures; ordinary navigation and clicks stay autocaptured. Meanings that are easy to misread:

- `global_search_opened` measures discovery reach, including empty openings. `global_search_started` fires once per opening when a user enters at least two non-whitespace characters. `search_started` on closure and result selection retains that intent after clearing the input; `has_query` still describes the current input. Measure deliberate search conversion from started to a result with `search_started=true` and `recent=false`, and keep recent-result browsing and the broad open-to-result funnel separate. No query text is captured.
- Module-load exceptions carry `failure_kind: module_load` and a `recovery_attempt` capped at three. `route_recovery_started` records an explicit Reload; `route_recovery_completed` requires the requested route to render successfully before its temporary cache-busting marker is removed. A pageview alone is not recovery, and these events do not identify the failed asset or delivery cause.
- `account_signed_in` fires after two-factor checks, so a pending challenge is not a sign-in; a signup produces only `account_created`.
- `roster_created` can be an empty row or a claimed guest draft; use `roster_unit_added` to measure building. Durable sync emits roster creation/deletion only on the transaction that applies the lifecycle change.
- `src/server/productActions.ts` owns the mutations and completion captures shared by direct handlers and durable actions. `delivery` distinguishes `direct` from `sync`. Sync captures only when its database transaction reports a newly applied action; recovered receipts and concurrent retries do not count another completion. The sync entry point still requires frozen roster metadata before sealing.
- `roster_imported` `source` and `roster_import_failed` `format` name the pasted format (`RosterTextFormat` in `src/shared/rosterFiles.ts`); formats without a roster source of their own save as `roster-file`.
- `roster_imported` means parsed and `guest_roster_imported` means opened as a local draft; `roster_import_saved` and `guest_roster_saved` mean saved, and retries can repeat a guest completion, so count unique people.
- `roster_import_review_required` means parsing left unmatched or unplaced entries. Historical events also include clean imports; filter for positive `missing_count` or `unplaced_count` when comparing periods.
- `roster_priced` and `roster_datasheet_loaded` come from the server, or from the browser when the device answers the read from its download (`constructionReadEvents` in `src/client/offline/constructionReads.ts`); both build their properties with `src/shared/rosterTelemetry.ts`, and `duration_ms` is where the work ran.
- Roster `unit_count` counts an attached character and bodyguard as one unit; request metrics and import `pick_count` count payload picks.
- `detachment_rules_covered` requires every selected detachment, including imported options, to resolve to supported Game Datacards semantics.
- `battle_command_submitted` refusals carry a `RefusalCode` from `src/core/battle.ts`, never the message; read it with `command`, since codes are shared across kinds. `unclassified` is a refusal the server's rules did not reproduce, expected only while releases overlap. `set-setup-step` appears only for battles set up before the one-page setup.
- Direct and synced battle commands share completion and lifecycle capture through `src/server/battleTelemetry.ts`. Synced successes require the database's atomic `applied` acknowledgement, not a replay precheck; stale and refused submissions count attempts. The optional report preserves older module responses, and an absent acknowledgement never counts a synced success.
- `battle_creation_started`, `battle_creation_submitted` and `battle_creation_failed` carry `source: roster` when opened from a saved roster's menu, `source: league` from a league event's battle chooser, and no `source` from Home or Battles. A league start completes as `league_battle_created`, not `battle_created`.
- Measure spectator invite conversion as unique people from `spectator_invite_followed` to `guest_roster_started`, `account_created`, or `battle_creation_submitted`; a battle finishing while watched can repeat `shown`.
- `collection_photo_screened` and `profile_picture_screened` carry TypeSafe Jev probabilities per question in `src/server/photoScreening.ts`, or an `outcome` of `unreadable` or `failed`. They decide nothing yet; choose thresholds from them before acting on uploads, and compare only rows from the same `model`.
- `reference` (`datasheet`, `detachment`, `faction`, `mission-pack`, or `mission-matchup`) marks flows begun on a reference page; measure reference conversion with it, not destination pageviews. Mission sources survive the one-use setup URL until guest creation or signed-in submission, then a later generic setup starts without that attribution. Join these starts to later `roster_unit_added` and `account_created` by person within a stated window; those later actions do not prove the same roster or that a mission was selected for it.
- Guest seats use `guest_invite_shared`, `guest_battle_joined`, `guest_seat_taken_back`, `guest_battle_claimed`, and `guest_battle_friend_requested` from the browser; the server captures no battle commands for a guest seat, so a guest's commands are missing from `battle_command_submitted`.
- Guest saving uses `guest_roster_save_gate_viewed`, `guest_roster_save_validation_failed`, and `guest_roster_save_gate_interacted` to distinguish arrival, invalid form fields, mode changes, and an explicit return to the draft. Authentication starts carry `purpose: guest_roster` on this path; `guest_roster_save_returned` marks the signed-in claim screen, with `automatic` distinguishing an immediate claim from a later confirmation. Browser validation can report several fields in one attempt; a missing event does not prove the draft was lost. `guest_roster_account_prompt_viewed` and `guest_roster_account_prompt_followed` carry the `reason` a visitor needed an account, such as `another-roster`, and the followed one carries whether they chose to create an account or sign in.
- `rules_text_load_failed` fires once per failed attempt to load a pinned upstream rules text file in the browser, with its `source` and a `reason` of `network`, `http` (with `status`), `mismatch` (not the pinned file), or `invalid`; a reader's Try again is a new attempt.
- `combat_simulator_setup_progressed` reports each of `attacker_selected`, `defender_selected`, `ready`, and `load_failed` at most once per mounted setup, with the existing `source`. Selection is not an estimate: use `combat_simulation_completed` for that outcome. `combat_simulator_example_started` and `combat_simulator_recent_opened` measure the optional entry actions; reopening and examples start a new setup. No matchup names, contents, or encoded state enter these events.

Only browser events carry `feature` and `surface`; server and native-shell events do not.

## Privacy boundary

Signed-in browsers identify with the account ID, and `PostHogBetterAuthIdentity` in `AppShell.tsx` sets the account's `name` and `email` as person properties for support. Event properties never carry names, emails, images, opaque tokens or IDs, search text, unit/list contents, command payloads, rules prose, or error messages; use bounded enums, booleans, counts, durations, and outcomes. Only server battle events carry an ID: `battle_id`, the battle's internal ID, never its URL token. Source-normalized faction/detachment labels are allowed; catalogue IDs are not.

The one exception is the automatic import report. When `roster_import_failed` fires (except `reason: share_link`, a New Recruit link), or `roster_import_review_required` has unmatched or unplaced entries, `RosterImport.tsx` files an App feedback response (`importFailureReport` in `src/client/features/feedback/feedback.ts`) whose message carries the unmatched and unplaced lines and the exact input, so the failure can be reproduced. The `roster_import_*` events stay free of list contents.

Exception tracking may carry stack traces; manual captures add only an operation label. `src/client/networkErrors.ts`, `src/client/realtimeErrors.ts`, and their callers decide which failures are expected and excluded.

## Feedback

Feedback opens a Support ticket (`src/client/features/feedback/support.ts`); reply in the Support inbox; a Workflow on `$conversation_message_sent` calls `/api/support-replies`, which emails the player. Dev servers fake Support (`devSupport.ts`); e2e stubs it.

Screenshots go to the private `praetorium-private` R2 bucket (production reaches it with the backup credentials) and only administrators can open their links.

## Source maps

`Dockerfile.node` uploads hosted web maps, including workers, before image publication and ships none; `scripts/webSourceMaps.test.ts` covers its failure paths. iOS uses the Expo/Metro plugins; see [PostHog's CLI documentation](https://posthog.com/docs/error-tracking/upload-source-maps/cli) for scopes and [Mobile release](mobile-release.md#build-and-upload) for delivery.

## Measuring success

Count unique people for conversion and retention, attempts for friction, and completed actions for use; funnels measure people, not objects, except that `battle_id` counts per-battle completion. Absence of an event indicates drop-off only after deployment and within a defined window.

Apply browser bot classifications only to browser events. PostHog classifies server SDK completions as Automation too; excluding that classification across a mixed funnel removes legitimate successful actions. Keep hostless historical server events when filtering the production host.

## Campaign links

Every link to praetorium.gg that is posted outside the app carries `utm_source`, `utm_medium`, and `utm_campaign`, so that each post or invitation can be measured on its own. Do not tag links inside the app, or links that point away from it, such as the Discord invite in `src/client/projectLinks.ts`: no Praetorium page reads them.

| Parameter      | Value                                  | Examples                                                       |
| -------------- | -------------------------------------- | -------------------------------------------------------------- |
| `utm_source`   | The site or organisation that shows it | `reddit`, `discord`, `facebook`, `github`, a store's short tag |
| `utm_medium`   | The kind of placement                  | `community` (a post), `outreach` (an invitation), `profile`    |
| `utm_campaign` | One post or invitation, never reused   | `community-introduction-01`, `readme`                          |

Use lowercase letters, digits, and hyphens. Values never carry a person's name, handle, or email. Use plain links without a tracking shortener. Keep placement plans, recipients and campaign schedules in private notes.

The browser SDK reads the parameters on landing. It puts them on that `$pageview`, adds `$session_entry_utm_*` to every event of that session, and sets `$initial_utm_*` on the person when the visitor signs in. Anonymous visitors have no person profile until then. Server events, such as `account_created` and `roster_created`, carry no campaign properties, so break them down by the person's `$initial_utm_source` and `$initial_utm_campaign`. A funnel that starts with a browser event can break down by `$session_entry_utm_source` with first-touch attribution, which also counts visitors who never sign up. Use `$session_entry_utm_campaign` to compare placements.

## Operational reports

Keep hosted dashboard links, saved insight definitions, acquisition baselines and trial results in private notes.

Report filters must exclude internal/test and owner traffic without dropping legitimate server completions. Inspect each saved insight for its cohort, window and instrumentation limits before comparing results.

## Verification

`e2e/telemetry.spec.ts` and adjacent tests cover event boundaries and excluded data. To verify campaign attribution, open a tagged link in a new private window, start a guest draft, and create an account; the person must then show that link's `$initial_utm_source` and `$initial_utm_campaign`. After deployment, inspect real events, guest-to-account identity linkage, host filtering, map resolution, replay masking, and MCP IP removal before claiming the integration works; event arrival alone proves neither privacy nor correct conversion.
