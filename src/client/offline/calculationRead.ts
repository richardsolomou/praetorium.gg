import { anySignal } from '../abortSignals'

export async function calculationRead<T>(
  online: (signal?: AbortSignal) => Promise<T>,
  local: (error?: unknown) => T | Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted()
  if (typeof window === 'undefined') return online(signal)
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return local()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('Calculation request timed out', 'TimeoutError')), 5_000)
  try {
    const result = await online(signal ? anySignal([signal, controller.signal]) : controller.signal)
    signal?.throwIfAborted()
    return result
  } catch (error) {
    signal?.throwIfAborted()
    return local(error)
  } finally {
    clearTimeout(timeout)
  }
}
