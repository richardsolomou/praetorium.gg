import { expect, it } from 'vitest'
import { authFailureReason } from './authFailureReason'

it.each([
  [
    'a wrong email or password',
    { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    'invalid_credentials',
  ],
  ['a sign-up for a taken email', { status: 422, code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }, 'account_exists'],
  ['a server failure', { status: 502, statusText: 'Bad Gateway' }, 'server_error'],
  ['a dropped connection', new TypeError('Failed to fetch'), 'network'],
  ['any other refusal', { status: 403, code: 'INVALID_ORIGIN' }, 'other'],
  ['a cancelled provider consent', 'access_denied', 'cancelled'],
  ['a cancelled Sign in with Apple', 'user_cancelled_authorize', 'cancelled'],
  ['an unlinked provider account callback', 'account_not_linked', 'account_not_linked'],
  ['a provider callback server failure', 'internal_server_error', 'server_error'],
  ['an unrecognised callback code', 'state_mismatch', 'other'],
])('reads %s as %s', (_, failure, reason) => {
  expect(authFailureReason(failure)).toBe(reason)
})
