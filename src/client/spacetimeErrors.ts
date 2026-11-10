import { IdentityChangedError, UnknownCallResultError } from 'spacetimedb'
import { isExpectedRealtimeFailure } from './realtimeErrors'

export function isExpectedRealtimeDisconnect(error: unknown): boolean {
  // The SDK ends a connection whose reconnect ticket names another session rather than serve it, and the loop opens a fresh one.
  if (error instanceof IdentityChangedError) return true
  // A call cut off by a dropped or closed socket; the next subscription repeats it.
  if (error instanceof UnknownCallResultError) return true
  return isExpectedRealtimeFailure(error)
}
