# Architecture

Dependencies point inward: `routes → client → contracts → core`; `server functions → server → database/adapters`. `src/core` and `src/shared` are IO-free; `src/contracts` holds cross-runtime types.

## Placement

- Page implementation lives in `src/client/features`; routes only compose. Query options live in `src/client/queries/<feature>.ts`.
- Components call `src/client/functions.ts`; transport calls stay in it and `src/client/offline`.
- Never move a `createServerFn` file: its path is part of the production function ID, so older open clients break.
- `src/core/battle.ts` owns the whole battle fold and validation; do not split it.
- After changing `src/db/authSchema.ts` or `src/db/oauthSchema.ts`, run `pnpm auth:db:generate` to add the migration in `drizzle-auth/`.
- Request adapters rebuild foreign `Request` objects from URL, fields, and body instead of `new Request(request)`.

## Offline work

`src/client/offline/syncEngine.ts` owns the queue. Invariants:

- Save durably before projecting into query data; refuse edits storage cannot hold (`src/contracts/localState.ts`). Storage failure never retries a completed server mutation.
- Downloads recheck their account and runtime inside delayed transactions and never replace newer acknowledged rosters or battles.
- A local battle workspace must hold at least the displayed sequence before validating a command.
- Conflicts stay on the device for review; never silently rebase or discard them. Invitations, admissions, sealing, and reveals stay pending until the server accepts them.
