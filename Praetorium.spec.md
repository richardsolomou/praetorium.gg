# Praetorium

Build and watch catalogue-backed battles, rosters, and league events with account-owned state.

## trust levels

- external-request (outside): HTTP paths, request bodies, and server function arguments supplied by callers.
- external-source (outside): Fetched community catalogue data and provider notifications received over the network.
- device-state (outside): Browser storage, native callbacks, and push payloads controlled by a device.
- operator-input (outside): Command arguments and files supplied by a maintainer or CI job.
- verified-session: Server-established account identity after authentication.
- validated-data: Parsed and authorized input accepted for application work.
- persisted-record: SQLite account records and SpacetimeDB product records, including battle logs.
- public-output: Responses and rendered state visible to players or spectators.

## entrances

- native auth ios: Runs the native iOS authentication proof from a developer command.
  handler: e2e/nativeAuthIos.ts
  trust: operator-input

## invariants
