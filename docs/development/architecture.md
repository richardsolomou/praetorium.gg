# Architecture

Dependencies point inward toward shared contracts and the IO-free domain:

```text
routes ──> client ──> contracts ──> core
  │          │                         ▲
  │          └────> server functions ──┤
  └──────────────────────> server ──> database/adapters
```

## Directories

| Location                | Responsibility                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/core`              | Deterministic domain decisions; no IO or framework imports except zod                                 |
| `src/contracts`         | Serializable cross-runtime types; depends on core, not application layers                             |
| `src/db`                | SQLite account schema                                                                                 |
| `src/server`            | Application services, authentication, catalogue loading, server functions, and SpacetimeDB repository |
| `src/adapters`          | External transports                                                                                   |
| `src/client/features`   | Feature components, local models, and adjacent tests                                                  |
| `src/client/components` | Shared browser components                                                                             |
| `src/components/ui`     | Generated, vendored shadcn components                                                                 |
| `src/routes`            | URLs, loaders, search validation, metadata, and page composition                                      |
| `catalogue`             | Source pins, attribution, authored patches, snapshot pin, and revocations                             |
| `scripts`               | Maintenance and deployment entry points; shared helpers in `scripts/lib`                              |

## Placement rules

Keep page implementation in client features. Routes compose it. Shared browser models live at the client root; React Query options live in `src/client/queries/<feature>.ts`, exported through `src/client/queries.ts`. The roster builder owns the loadout editor reused by simulation.

Client code may call `src/server/functions`, but must not import server implementation modules. Cross-boundary types belong in contracts. `src/core/datasheet.ts` owns domain datasheet shapes, re-exported by `src/contracts/catalogue.ts`.

Keep existing `createServerFn` source paths: the pinned compiler includes filenames in production function IDs, so moving them can break older open clients.

`PraetoriumService` and repository facades delegate complete application areas while preserving one entry point. Split modules by responsibility, not length; keep each domain decision under one owner. `src/core/battle.ts` deliberately owns the full battle fold and validation.

## Tests

Keep tests beside the behavior. Use `*.integration.test.ts` for database, service, authentication, and snapshot boundaries; other `*.test.ts` files are unit tests. [Contributing](../../CONTRIBUTING.md#check-a-change) owns the check commands.

Test public behavior with shared harnesses and scenario-specific suites. Request adapters must accept foreign `Request` implementations: rebuild from URL, fields, and body instead of passing the foreign object into `new Request(request)`.
