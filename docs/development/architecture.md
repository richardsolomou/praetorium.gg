# Architecture

Praetorium is organized first by runtime boundary and then by product feature. Dependencies point inward toward shared contracts and the IO-free domain.

```text
routes ──> client ──> contracts ──> core
  │          │                         ▲
  │          └────> server functions ──┤
  │                         │           │
  └──────────────────────> server ──> database/adapters
```

## Directories

- `src/core` owns deterministic domain decisions. It contains no IO or framework imports.
- `src/contracts` owns serializable types shared across runtime boundaries. Contracts may depend on core types but not application layers.
- `src/db` owns Postgres schema, migrations, and repositories. `Repository` is the stable facade; bounded persistence areas live under `src/db/repositories`.
- `src/adapters` owns external transports such as email, realtime, telemetry, and Valkey.
- `src/server` owns application services, catalogue loading, authentication, and server functions. `PraetoriumService` is the stable facade; bounded application areas live under `src/server/services`.
- `src/client/features` groups browser code by product area. A feature contains its components, local models, and tests.
- `src/client/components` contains components shared by multiple features.
- `src/components/ui` is generated shadcn code and is treated as vendored.
- `src/routes` owns URLs, search validation, loaders, metadata, and composition of feature pages.

## Placement rules

A route should not contain a substantial page implementation. Move state and rendering into a client feature, leaving the route responsible for the URL and initial data.

The roster builder lives under `src/client/features/rosters/builder`, battle setup under `src/client/features/battle/setup`, and rules and catalogue pages under `src/client/features/reference`. Route files compose those pages and keep URL parameters and metadata.

A type returned across a server-function boundary belongs in `src/contracts` when client code needs to name it. Client code may call `src/server/functions` but must not import server implementation modules.

Feature-specific browser code belongs in `src/client/features/<feature>`. Put a component in `src/client/components` only when multiple features use it.

React Query options belong in `src/client/queries/<feature>.ts`. `src/client/queries.ts` is the public barrel so consumers depend on query behavior rather than its file placement.

Repository and service facades preserve one application entry point while delegating complete vertical slices. A collaborator owns all methods for its area; do not scatter one transaction or policy decision between the facade and collaborator.

Large authoritative modules are not split by line count alone. `src/core/battle.ts` deliberately owns the complete battle fold and validation. Split a module only when the extracted responsibility has one clear owner and does not duplicate a decision.

`src/core/datasheet.ts` owns datasheet shapes used by deterministic combat code. `src/contracts/catalogue.ts` re-exports them for server and client consumers. Server catalogue projection, display modifiers, and unit pricing rules live in separate modules under `src/server`.

## Tests

Tests stay beside the behavior they specify. Split large suites by scenario while continuing to exercise the same public entry point, and share setup through a narrowly named harness rather than copying fixtures.

Use `*.integration.test.ts` for database, application-service, authentication, and snapshot integration tests; other `*.test.ts` files are unit tests. Use `just test-unit` for the fast feedback loop and `just test-integration` for those integration boundaries. `just check` continues to run the complete suite.
