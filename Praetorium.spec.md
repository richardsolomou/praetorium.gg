# Praetorium

Build and watch catalogue-backed battles, rosters, and league events with account-owned state.

## trust levels

- external-request (outside): URL, request body, and RPC arguments supplied by any browser or HTTP caller.
- external-source (outside): Fetched community catalogue and rules bytes, plus provider events arriving over the network.
- device-state (outside): Browser storage, cookies, native callbacks, and push payloads supplied by a device.
- verified-session: Server-established user identity after authentication.
- validated-data: Parsed, verified, and authorized application input.
- persisted-record: Postgres rows and append-only logs, including records written by older versions.
- public-output: Responses and rendered data visible to an account or spectator.

## invariants
