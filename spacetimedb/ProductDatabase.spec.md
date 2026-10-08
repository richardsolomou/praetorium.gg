# Product database

The SpacetimeDB module that stores rosters, battles, leagues, friendships and revision signals, and admits callers by identity.

## entrances

- operator procedures: the web server, connected as the configured operator identity, reads and writes product state through procedures and reducers that call requireOperator
  handler: requireOperator in spacetimedb/src/index.ts
  trust: operator
- player connection: a browser or native shell connects with a deployment-issued access token, watches battles, revokes its own access and subscribes to its own signal views
  handler: onConnect in spacetimedb/src/index.ts
  trust: player
- configure: the database owner sets the token issuer, audience and operator identity once
  handler: configure in spacetimedb/src/index.ts
  trust: operator

## invariants
