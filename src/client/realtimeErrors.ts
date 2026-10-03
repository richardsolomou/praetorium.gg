const FETCH_NETWORK_FAILURES = ['failed to fetch', 'networkerror when attempting to fetch resource', 'load failed', 'fetch failed']

export class RealtimeHttpError extends Error {
  constructor(
    operation: string,
    readonly status: number,
  ) {
    super(`${operation} failed with HTTP ${status}`)
  }
}

export function isExpectedRealtimeDisconnect(error: unknown): boolean {
  if (typeof Event !== 'undefined' && error instanceof Event && error.type === 'error') return true
  if (error instanceof RealtimeHttpError) {
    return error.status === 401 || error.status === 408 || error.status === 429 || error.status >= 500
  }
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'UnauthorizedError') return true
  if (typeof message !== 'string') return false
  if (message.includes('connection closed')) return true
  const lowered = message.toLowerCase()
  return name === 'TypeError' && FETCH_NETWORK_FAILURES.some((phrase) => lowered.includes(phrase))
}
