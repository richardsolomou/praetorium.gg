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
  battleCommands.set(token, settled)
  void settled.then(() => {
    if (battleCommands.get(token) === settled) battleCommands.delete(token)
  })
  return holding
}

export const battleCommandsSettled = (token: string) => battleCommands.get(token)

/** Whether a reload now could drop a change this page has not finished sending or saving. */
export const writesPending = (client: QueryClient) => held > 0 || client.isMutating() > 0

/** Server function writes post, so a stale page waits for them before it reloads. */
export const pendingWriteMiddleware = createMiddleware({ type: 'function' }).client(({ method, next }) =>
  method === 'POST' ? holdingReload(next()) : next(),
)
