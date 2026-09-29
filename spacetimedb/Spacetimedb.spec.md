# Spacetimedb

Validate and transact authoritative product records and realtime events.

## entrances

- product procedures: Receives application queries and commands for authoritative product state.
  handler: src/index.ts
  trust: external-request
- session reducers: Receives device session and watch requests over the realtime connection.
  handler: src/index.ts
  trust: device-state
- scheduled expiry: Receives scheduled access and revocation expiry events.
  handler: expireAccess in src/index.ts
  trust: persisted-record

## invariants
