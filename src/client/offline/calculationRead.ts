import { withTimeout } from '../abortSignals'

export async function calculationRead<T>(
  online: (signal?: AbortSignal) => Promise<T>,
  local: (error?: unknown) => T | Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted()
  if (typeof window === 'undefined') return online(signal)
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return local()
  try {
    const result = await online(withTimeout(signal, 5_000))
    signal?.throwIfAborted()
    return result
  } catch (error) {
    signal?.throwIfAborted()
    return local(error)
  }
}
