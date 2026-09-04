# Telemetry

Praetorium uses PostHog for analytics, replay, flags, errors, performance, and server logs. The integration is optional. Every product path works without PostHog variables.

The browser integration inside the mobile WebView owns identified product events and masked session replay. The Expo shell uses a separate native client for application lifecycle events and native-shell exceptions when `EXPO_PUBLIC_POSTHOG_API_KEY` is set. Native screenshot replay stays disabled because it cannot redact the WebView DOM without masking the whole view. Production EAS Build uploads the native JavaScript source maps through the PostHog Expo and Metro plugins. Canary builds exercise the same tooling in dry-run mode because preview jobs do not receive the source-map upload credential.

## Event contract

Custom events describe completed user or domain actions. Page navigation and
ordinary clicks remain autocaptured.

| Area       | Events                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account    | `account_created`, `account_deleted`, `account_signed_in`, `account_authentication_started`, `account_authentication_failed`, `profile_updated`, `password_changed`, `sign_in_method_added`, `sign_in_method_linking_started`, `sign_in_method_removed`, `two_factor_enabled`, `two_factor_disabled`, `two_factor_recovery_codes_copied` |
| Admin      | `admin_user_created`, `admin_user_role_changed`, `admin_user_password_changed`, `admin_impersonation_started`, `admin_impersonation_stopped`                                                                                                                                                                                             |
| Friends    | `friend_request_sent`, `friend_request_accepted`, `friendship_removed`                                                                                                                                                                                                                                                                   |
| Collection | `player_collection_updated`, `favourite_faction_updated`, `favourite_detachment_updated`                                                                                                                                                                                                                                                 |
| Rosters    | `roster_created`, `roster_duplicated`, `roster_imported`, `roster_import_failed`, `roster_exported`, `roster_export_copied`, `roster_shared`, `roster_deleted`, `roster_visibility_updated`, `roster_unit_added`, `roster_unit_removed`, `roster_unit_duplicated`, `roster_attachment_updated`                                           |
| Navigation | `global_search_result_opened`                                                                                                                                                                                                                                                                                                            |
| Battles    | `battle_created`, `battle_roster_attached`, `battle_started`, `battle_finished`, `battle_reopened`, `battle_deleted`, `battle_command_submitted`, `battle_spectated`, `battle_audience_set`                                                                                                                                              |
| Leagues    | `league_created`, `league_updated`, `league_deleted`, `league_event_created`, `league_event_updated`, `league_joined`, `league_roster_requirement_assigned`, `league_team_assigned`, `league_roster_submitted`, `league_rosters_revealed`, `league_battle_created`                                                                       |
| Quality    | `roster_datasheet_loaded`, `roster_datasheet_rendered`, sampled `roster_priced`, `$exception`, and structured server error logs                                                                                                                                                                                                          |

`battle_command_submitted` contains the command kind and outcome. It does not contain the command payload. Datasheet metrics separate server work, request time, and render time. Performance events contain durations and workload counts only.

Builder events cover structural roster changes, not autosave or each loadout
stepper click. Search events carry only the bounded result group and result count;
import failures carry only a bounded reason and input kind.

## Privacy boundary

Analytics properties exclude names, email addresses, images, battle tokens, roster
ids, catalogue ids, search text, unit names, list contents, command payloads, rules
text, and error messages. They contain only bounded enums, booleans, counts,
durations, and non-sensitive outcome labels.

Errors may contain stack traces through PostHog Error Tracking. Manual exception
captures add only an operation label. Server logs use stable messages and bounded
request metadata rather than request bodies or URLs containing opaque ids.

## Measuring success

The core product funnel is account created → roster created or imported → battle
created → roster attached → battle started → battle finished. Command outcomes,
exceptions, replay, and sampled roster-pricing and datasheet-duration distributions
explain drop-off between those stages.
