import { IdentityChangedError, UnknownCallResultError } from 'spacetimedb'
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

function isSocketErrorEvent(value: unknown) {
  return typeof Event !== 'undefined' && value instanceof Event && value.type === 'error'
}

export function isExpectedRealtimeDisconnect(error: unknown): boolean {
  // The SDK wraps the browser's socket error event in an Error.
  if (isSocketErrorEvent(error) || (error instanceof Error && isSocketErrorEvent(error.cause))) return true
  if (isRealtimeServiceUnavailable(error)) return true
  if (error instanceof RealtimeHttpError) return error.status === 401 || error.status === 408 || error.status === 429
  if (isFetchNetworkFailure(error)) return true
  // The SDK ends a connection whose reconnect ticket names another session rather than serve it, and the loop opens a fresh one.
  if (error instanceof IdentityChangedError) return true
  // A call cut off by a dropped or closed socket; the next subscription repeats it.
  if (error instanceof UnknownCallResultError) return true
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'UnauthorizedError' || name === 'TimeoutError') return true
  if (typeof message !== 'string') return false
  return (
    message.includes('connection closed') ||
    message.startsWith('WebSocket closed') ||
    message === 'Session busy' ||
    message.startsWith('Failed to verify token')
  )
}
