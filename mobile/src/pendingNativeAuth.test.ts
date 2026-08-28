import { describe, expect, it } from 'vitest'
import { completedPendingNativeAuth, parsePendingNativeAuth, pendingNativeAuth } from './pendingNativeAuth'

const proof = { challenge: 'c'.repeat(43), verifier: 'v'.repeat(43) }

describe('pending native authentication', () => {
  it('keeps a pending proof through a process restart', () => {
    const pending = { ...pendingNativeAuth(proof, 100), callbackUrl: 'praetorium://auth?token=secret' }

    expect(parsePendingNativeAuth(JSON.stringify(pending), 200)).toEqual(pending)
  })

  it('fails closed after the exchange window or for malformed storage', () => {
    const completed = completedPendingNativeAuth(proof, 'praetorium://auth?token=secret', 100)

    expect(parsePendingNativeAuth(JSON.stringify(completed), 3 * 60 * 1000 + 100)).toBeNull()
    expect(parsePendingNativeAuth('{')).toBeNull()
  })

  it('covers a delayed provider start and resets expiry for a fresh callback', () => {
    const started = pendingNativeAuth(proof, 100)
    expect(parsePendingNativeAuth(JSON.stringify(started), 15 * 60 * 1000 + 99)).toEqual(started)

    const completedAfterFiveMinuteLoad = completedPendingNativeAuth(proof, 'praetorium://auth?token=secret', 15 * 60 * 1000 + 99)
    expect(parsePendingNativeAuth(JSON.stringify(completedAfterFiveMinuteLoad), 18 * 60 * 1000 + 98)).toEqual(completedAfterFiveMinuteLoad)
  })

  it('expires the local provider envelope at fifteen minutes', () => {
    const started = pendingNativeAuth(proof, 100)

    expect(parsePendingNativeAuth(JSON.stringify(started), 15 * 60 * 1000 + 100)).toBeNull()
  })
})
