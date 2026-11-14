import { withTimeout } from '../abortSignals'
import { isOffline } from './reads'

/**
 * How long a read waits for the server when the device has no downloaded rules to answer with instead: a slow answer
 * still beats the error it would otherwise become, and a cold rules version takes seconds on a busy server.
 */
export const SERVER_ONLY_TIMEOUT_MS = 30_000

export async function calculationRead<T>(
  online: (signal?: AbortSignal) => Promise<T>,
  local: (error?: unknown) => T | Promise<T>,
  signal?: AbortSignal,
  serverTimeoutMs = 5_000,
): Promise<T> {
  signal?.throwIfAborted()
  if (typeof window === 'undefined') return online(signal)
  if (isOffline()) return local()
  try {
    const result = await online(withTimeout(signal, serverTimeoutMs))
    signal?.throwIfAborted()
    return result
  } catch (error) {
    signal?.throwIfAborted()
    return local(error)
  }
}
