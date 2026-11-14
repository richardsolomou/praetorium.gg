# Running locally

## Catalogue

- `just dev` builds a missing catalogue from public sources; never ask for credentials or a rules-version choice.
- `just catalogue-sync` needs `R2_*` credentials in the main checkout's ignored `.env.local` for an uncached snapshot.
- Never edit the shared snapshot cache in place; `CATALOGUE_CACHE_DIR=off` gives worktree-local copies.

## Development lifecycle

- When a tool pin changes in `mise.toml`, `package.json`, or `Dockerfile.node`, change it in `.devcontainer/Dockerfile` too.
- In a Codespace, open the forwarded port 3000 for the app.
- Run `just dev` after any checkout, pull, or merge, and use the URL it prints; a stale lockfile leaves pages that never finish loading.
- `just dev-status` reports, `just dev-stop` stops only this worktree's stack, `just dev-restart` reloads after product-module, startup, or catalogue changes, and `just teardown` runs once the branch's pull request has merged.
- Never kill a process by a shared port or a broad process-name match. On a collision with an explicit `LOCAL_*_PORT`, pick another free port.
- A manual product migration stops startup rather than clearing data. Logs: `data-dev/dev.log`.

## Browser tests

- `just e2e` runs isolated production-mode stacks; never test against the interactive Vite preview, which skips production hydration.
- Pull requests run only specs selected by `scripts/lib/e2eSelection.ts`; run every spec with `gh workflow run ci.yml --ref <branch>`.
- Before hydration, presses, link navigations, and typed values are lost; retry until the outcome appears (`retryUntilVisible`, `followLink` in `e2e/account.ts`), never wait for time.
- A changed URL can precede the routed content; wait for the destination heading.
- Concurrent-tab save assertions check the persisted result, since either tab can flush the shared queue.
- Specs calling `browser.newContext()` import `test` from `e2e/test.ts` so contexts close.
- Live battle pages never reach `networkidle`; scope assertions to `data-unit`, `data-roster`, and `data-person`.
- Test titles must differ after punctuation is removed.
- Screenshot baselines (`toHaveScreenshot`) come only from the Linux CI runner, because fonts render differently elsewhere. After a run fails a comparison, `just e2e-screenshots <run id>` copies the runner's images over the baselines; look at each one before committing it.

## Load test

- `just load-test-round` times the end of a busy tournament round and group league round against a throwaway SpacetimeDB, with options in `scripts/loadTestRound.ts`. Timings depend on the machine, so compare a change with a run of `main` on the same machine.

## Production roster copies

- `just rosters-fetch` exports production selections; `just rosters-import` copies that snapshot into the local preview account. Keep snapshots in ignored `data-dev/` and credentials out of commands and tracked files.
- `just rosters-normalise --apply` writes to production; run it only from a checkout of the deployed release.
