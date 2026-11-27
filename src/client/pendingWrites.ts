import type { QueryClient } from '@tanstack/react-query'
import { createMiddleware } from '@tanstack/react-start'

let held = 0

/** Keeps automatic reloads waiting until `write` settles, for writes that do not run through React Query mutations. */
export function holdingReload<T>(write: Promise<T>): Promise<T> {
  held++
  return write.finally(() => held--)
}

const battleCommands = new Map<string, Promise<unknown>>()

/** Holds reloads like `holdingReload`, and lets `battleCommandsSettled` wait for this battle's commands to finish. */
export function sendingBattleCommands<T>(token: string, write: Promise<T>): Promise<T> {
  const holding = holdingReload(write)
  const settled = holding.then(
    () => {},
    () => {},
  )
  // A page left inside the app keeps sending, so a battle opened again can drain twice at once and has settled only when both have.
  const all = Promise.all([battleCommands.get(token), settled]).then(() => {})
  battleCommands.set(token, all)
  void all.then(() => {
    if (battleCommands.get(token) === all) battleCommands.delete(token)
  })
  return holding
}

export const battleCommandsSettled = (token: string) => battleCommands.get(token)

// A connected battle's queued commands live only in this page, so closing or reloading it before they send drops them.
if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', (event) => {
    if (!battleCommands.size) return
    event.preventDefault()
    // oxlint-disable-next-line typescript/no-deprecated -- Chrome before 119, inside the build target, asks only when this is set.
    event.returnValue = true
  })

/** Whether a reload now could drop a change this page has not finished sending or saving. */
export const writesPending = (client: QueryClient) => held > 0 || client.isMutating() > 0

/** Server function writes post, so a stale page waits for them before it reloads. */
export const pendingWriteMiddleware = createMiddleware({ type: 'function' }).client(({ method, next }) =>
  method === 'POST' ? holdingReload(next()) : next(),
)
