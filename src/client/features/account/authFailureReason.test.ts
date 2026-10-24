import { describe, expect, it } from 'vitest'
import { authFailureReason } from './authFailureReason'

describe('authentication failure reason', () => {
  it('reads a wrong email or password as invalid credentials', () => {
    expect(authFailureReason({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' })).toBe(
      'invalid_credentials',
    )
  })

  it('reads a rate-limit refusal as rate limited', () => {
    expect(authFailureReason({ status: 429, statusText: 'Too Many Requests' })).toBe('rate_limited')
  })

  it('reads a sign-up for a taken email as an existing account', () => {
    expect(authFailureReason({ status: 422, code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toBe('account_exists')
  })

  it('reads a server failure as a server error', () => {
    expect(authFailureReason({ status: 502, statusText: 'Bad Gateway' })).toBe('server_error')
  })

  it('reads a dropped connection as a network failure', () => {
    expect(authFailureReason(new TypeError('Failed to fetch'))).toBe('network')
  })

  it('reads any other refusal as other', () => {
    expect(authFailureReason({ status: 403, code: 'INVALID_ORIGIN' })).toBe('other')
  })

  it('reads an unexpected thrown error as other', () => {
    expect(authFailureReason(new Error('boom'))).toBe('other')
  })

  it('reads a cancelled provider consent as cancelled', () => {
    expect(authFailureReason('access_denied')).toBe('cancelled')
  })

  it('reads a cancelled Sign in with Apple as cancelled', () => {
    expect(authFailureReason('user_cancelled_authorize')).toBe('cancelled')
  })

  it('reads an unlinked provider account from its callback code', () => {
    expect(authFailureReason('account_not_linked')).toBe('account_not_linked')
  })

  it('reads a provider callback server failure as a server error', () => {
    expect(authFailureReason('internal_server_error')).toBe('server_error')
  })

  it('reads an unrecognised callback code as other', () => {
    expect(authFailureReason('state_mismatch')).toBe('other')
  })
})
