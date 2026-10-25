import { classifyAuthCallbackFailure, classifySignInFailure } from 'ras-stack/auth/client'
import { isFetchNetworkFailure } from '../../networkErrors'

type AuthFailureReason =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'account_exists'
  | 'server_error'
  | 'network'
  | 'cancelled'
  | 'account_not_linked'
  | 'account_already_linked'
  | 'email_mismatch'
  | 'invalid_token'
  | 'token_expired'
  | 'other'

function callbackFailureReason(error: string): AuthFailureReason {
  switch (error.trim().toLowerCase()) {
    case 'access_denied':
    // Apple's own code for a cancelled sign-in, forwarded unchanged by the callback.
    case 'user_cancelled_authorize':
      return 'cancelled'
    case 'internal_server_error':
      return 'server_error'
  }
  const reason = classifyAuthCallbackFailure(error)
  return reason === 'error' ? 'other' : reason
}

/**
 * The `reason` on `account_authentication_failed`, from a better-auth client error, the fetch failure it rejected
 * with, or the `error` code an OAuth callback redirected with.
 */
export function authFailureReason(failure: unknown): AuthFailureReason {
  if (typeof failure === 'string') return callbackFailureReason(failure)
  if (isFetchNetworkFailure(failure)) return 'network'
  const signIn = classifySignInFailure(failure)
  if (signIn !== 'error') return signIn
  const { status, code } = (failure ?? {}) as { status?: unknown; code?: unknown }
  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') return 'account_exists'
  if (typeof status === 'number' && status >= 500) return 'server_error'
  return 'other'
}
