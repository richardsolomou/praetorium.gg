# Telemetry

Praetorium uses one PostHog integration for product analytics, session replay,
feature flags, browser and server error tracking, performance, and server logs.
The integration is optional: an instance without the PostHog environment variables
keeps every product path working.

## Event contract

Custom events describe completed user or domain actions. Page navigation and
ordinary clicks remain autocaptured.

| Area       | Events                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account    | `account_created`, `account_signed_in`, `account_authentication_started`, `account_authentication_failed`, `profile_updated`                                                                                                                                                                   |
| Friends    | `friend_request_sent`, `friend_request_accepted`, `friendship_removed`                                                                                                                                                                                                                         |
| Collection | `player_collection_updated`, `favourite_faction_updated`                                                                                                                                                                                                                                       |
| Rosters    | `roster_created`, `roster_duplicated`, `roster_imported`, `roster_import_failed`, `roster_exported`, `roster_export_copied`, `roster_shared`, `roster_deleted`, `roster_visibility_updated`, `roster_unit_added`, `roster_unit_removed`, `roster_unit_duplicated`, `roster_attachment_updated` |
| Navigation | `global_search_result_opened`                                                                                                                                                                                                                                                                  |
| Battles    | `battle_created`, `battle_joined`, `battle_roster_attached`, `battle_started`, `battle_finished`, `battle_reopened`, `battle_deleted`, `battle_command_submitted`                                                                                                                              |
| Quality    | `roster_datasheet_loaded`, sampled `roster_priced`, `$exception`, and structured server error logs                                                                                                                                                                                             |

`battle_command_submitted` carries the command kind and domain outcome, so feature
usage and stale or refused commands can be compared without recording the command
payload. Performance events carry duration and workload counts only.

Builder events cover structural roster changes, not autosave or each loadout
stepper click. Search events carry only the bounded result group and result count;
import failures carry only a bounded reason and input kind.

## Privacy boundary

Never capture names, email addresses, images, battle tokens, roster ids, catalogue
ids, search text, unit names, list contents, command payloads, rules text, or error
messages as analytics properties. Safe properties are bounded enums, booleans,
counts, durations, and non-sensitive outcome labels.

Errors may contain stack traces through PostHog Error Tracking. Manual exception
captures add only an operation label. Server logs use stable messages and bounded
request metadata rather than request bodies or URLs containing opaque ids.

## Measuring success

The core product funnel is account created → roster created or imported → battle
created → roster attached → battle started → battle finished. Diagnose drop-off
with command outcomes, exceptions, replay, and the sampled roster pricing and
datasheet duration distributions.
