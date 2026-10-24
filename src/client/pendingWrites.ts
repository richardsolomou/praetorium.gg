import type { QueryClient } from '@tanstack/react-query'

let held = 0

/** Keeps automatic reloads waiting until `write` settles, for writes that do not run through React Query mutations. */
export function holdingReload<T>(write: Promise<T>): Promise<T> {
  held++
  return write.finally(() => held--)
}

/** Whether a reload now could drop a change this page has not finished sending or saving. */
export const writesPending = (client: QueryClient) => held > 0 || client.isMutating() > 0
