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
| `src/shared`            | IO-free catalogue, pricing, construction, and simulation reused by browser and server                 |
| `src/server`            | Application services, authentication, catalogue loading, server functions, and SpacetimeDB repository |
| `src/adapters`          | External transports                                                                                   |
| `src/client/features`   | Feature components, local models, and adjacent tests                                                  |
| `src/client/components` | Shared browser components                                                                             |
| `src/components/ui`     | Generated, vendored shadcn components                                                                 |
| `src/routes`            | URLs, loaders, search validation, metadata, and page composition                                      |
| `spacetimedb/src`       | Product database module; its unit tests run on the SDK's in-memory host (`module.test.ts`)            |
| `catalogue.json`        | Release snapshot pin                                                                                  |
| `scripts`               | Maintenance and deployment entry points; shared helpers in `scripts/lib`                              |

## Placement rules

Keep page implementation in client features; routes compose it. React Query options live in `src/client/queries/<feature>.ts`, exported through `src/client/queries.ts`.

Application components and queries call `src/client/functions.ts`, which chooses local construction, durable edits, cached reads, or server functions. Keep transport calls inside that facade and `src/client/offline`; client code must not import server implementation modules. Cross-boundary types belong in contracts.

Keep existing `createServerFn` source paths: the pinned compiler includes filenames in production function IDs, so moving them can break older open clients.

Split modules by responsibility, not length, and keep each domain decision under one owner; `src/core/battle.ts` deliberately owns the full battle fold and validation.

## Offline work

`src/client/offline/syncEngine.ts` owns durable enqueue, ordering, dependencies, sender leases, and acknowledgements; IndexedDB and native generation files implement the same account-scoped storage contract. Invariants:

- Save durably before projecting a change into query data, and refuse an edit before projecting it when storage cannot accept it (`MAX_LOCAL_STATE_BYTES`, `MAX_LOCAL_OPERATIONS` in `src/contracts/localState.ts`). Persist refreshed query data before a roster save or battle command finishes so an immediate reload retains it; storage failure must not retry a completed server mutation.
- Local work projects roster edits and command logs through the shared domain authority; the server revalidates on sync.
- Coalesce only consecutive roster saves never sent to the server; retries keep the original operation ID and content. Battle commands keep their selected random cards and recorded timestamps.
- Never replace a later local edit with an earlier acknowledgement, or write across an account generation. Downloads carry their initiating account and runtime and check both again inside delayed storage transactions.
- Versioned downloads cannot replace newer acknowledged rosters or battles; unversioned downloads and summary pruning retain documents changed since the request started, and return them to query consumers as well as storage.
- Collection and favourite deltas update the current document in the same transaction that appends the queued action.
- An acknowledgement refreshes only the query families its operation kind can change (`invalidateSyncedQueries` in `src/client/productSignals.ts`); catalogue reads and roster prices never refetch after a sync.
- Do not project clean saved league documents over online query results. A local battle workspace must contain at least the displayed sequence before validating a command; refresh older workspaces online and keep the newer screen offline.
- New online rosters attempt a bounded sync before navigation so a cold reload can find them on the server.

`src/server/functions/offline.ts` authenticates queued actions with the ordinary mutation origin checks. SpacetimeDB commits product mutations and retry receipts atomically; roster versions and battle sequences detect concurrent changes, and conflicts stay on the device for review — never silently rebase or discard them. Discarding a prerequisite keeps dependent actions for review; receipts expire after `SYNC_RETENTION_MS`, and expired actions require review. Invitations, league admissions, sealing, and reveals stay pending until server acceptance, and sealing refuses a changed authoritative copy. Downloaded battle commands fold through the existing domain authority, with private history sanitized before download. Public construction bundles serialize the same catalogue and rules the server uses.

## Tests

Keep tests beside the behavior. Use `*.integration.test.ts` for database, service, authentication, and snapshot boundaries; other `*.test.ts` files are unit tests. [Contributing](../../CONTRIBUTING.md#check-a-change) owns the check commands.

Request adapters must accept foreign `Request` implementations: rebuild from URL, fields, and body instead of passing the foreign object into `new Request(request)`.
