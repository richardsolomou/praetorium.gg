import { isFetchNetworkFailure } from './networkErrors'

export class RealtimeHttpError extends Error {
  constructor(
    operation: string,
    readonly status: number,
  ) {
    super(`${operation} failed with HTTP ${status}`)
  }
}

/** A service-side refusal that persisted through retries, unlike a single deploy or backup interruption. */
export class RealtimeOutageError extends Error {
  constructor(cause: RealtimeHttpError, attempts: number) {
    super(`${cause.message} on ${attempts} consecutive attempts`, { cause })
  }
}

export function isRealtimeServiceUnavailable(error: unknown): error is RealtimeHttpError {
  return error instanceof RealtimeHttpError && error.status >= 500
}

export function isExpectedRealtimeDisconnect(error: unknown): boolean {
  if (typeof Event !== 'undefined' && error instanceof Event && error.type === 'error') return true
  if (isRealtimeServiceUnavailable(error)) return true
  if (error instanceof RealtimeHttpError) return error.status === 401 || error.status === 408 || error.status === 429
  if (isFetchNetworkFailure(error)) return true
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'UnauthorizedError') return true
  return typeof message === 'string' && message.includes('connection closed')
}
