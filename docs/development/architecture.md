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

A type returned across a server-function boundary belongs in `src/contracts` when client code needs to name it. Client code may call `src/server/functions` but must not import server implementation modules.

Feature-specific browser code belongs in `src/client/features/<feature>`. Put a component in `src/client/components` only when multiple features use it.

React Query options belong in `src/client/queries/<feature>.ts`. `src/client/queries.ts` is the public barrel so consumers depend on query behavior rather than its file placement.

Repository and service facades preserve one application entry point while delegating complete vertical slices. A collaborator owns all methods for its area; do not scatter one transaction or policy decision between the facade and collaborator.

Large authoritative modules are not split by line count alone. `src/core/battle.ts` deliberately owns the complete battle fold and validation. Split a module only when the extracted responsibility has one clear owner and does not duplicate a decision.

## Tests

Tests stay beside the behavior they specify. Split large suites by scenario while continuing to exercise the same public entry point, and share setup through a narrowly named harness rather than copying fixtures.

Use `just test-unit` for the fast feedback loop. Use `just test-integration` for database, application-service, authentication, and snapshot integration tests. `just check` continues to run the complete suite.
