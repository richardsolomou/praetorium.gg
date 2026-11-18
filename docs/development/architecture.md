# Architecture

Dependencies point inward: `routes → client → contracts → core`; `server functions → server → database/adapters`. `src/core` and `src/shared` are IO-free; `src/contracts` holds cross-runtime types.

## Placement

- Page implementation lives in `src/client/features`; routes only compose. Query options live in `src/client/queries/<feature>.ts`.
- Everything in a route file except its components, and everything the shell imports statically, ships in the bundle every page loads first. Keep search parsing and loader helpers in small modules apart from page components. CI's build lane compares that bundle with the base through `scripts/startupBundle.ts` and fails on a large jump.
- Components call `src/client/functions.ts`; transport calls stay in it and `src/client/offline`.
- A module ships whole, with everything any page uses from it, in the first bundle that imports it statically. The shell and route files import constants and helpers from small modules, never from `src/core/battle.ts`, a component file, or a module that parses a large table. Route loaders `import()` page-only helpers when they run.
- `src/client/functions.ts` loads the offline fallbacks on first call, or during idle time on a usable connection after the first screen for an account or a downloaded reference; nothing else imports `src/client/offline/*Functions.ts` statically.
- Never move a `createServerFn` file: its path is part of the production function ID, so older open clients break.
- `src/core/battle.ts` owns the whole battle fold and validation (`commandRefusal` and `apply`); do not split those. The helpers it calls (`battlePhases`, `battleSeats`, `battleFormat`, `battleUnits`, `battleSides`, `battleSecondaries`, `battleMoments`) import only types from it, so no import cycle forms, and it re-exports their public names.
- After changing `src/db/authSchema.ts` or `src/db/oauthSchema.ts`, run `pnpm auth:db:generate` to add the migration in `drizzle-auth/`.
- Request adapters rebuild foreign `Request` objects from URL, fields, and body instead of `new Request(request)`.

## Offline work

`src/client/offline/syncEngine.ts` owns the queue. Invariants:

- Save durably before projecting into query data; refuse edits storage cannot hold (`src/contracts/localState.ts`). Storage failure never retries a completed server mutation.
- Downloads recheck their account and runtime inside delayed transactions and never replace newer acknowledged rosters or battles.
- A local battle workspace must hold at least the displayed sequence before validating a command.
- Conflicts stay on the device for review; never silently rebase or discard them. Invitations, admissions, sealing, and reveals stay pending until the server accepts them.
