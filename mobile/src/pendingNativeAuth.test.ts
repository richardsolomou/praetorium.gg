import { describe, expect, it } from 'vitest'
import { parsePendingNativeAuth, pendingNativeAuth } from './pendingNativeAuth'

const proof = { challenge: 'c'.repeat(43), verifier: 'v'.repeat(43) }

describe('pending native authentication', () => {
  it('keeps a pending proof through a process restart', () => {
    const pending = { ...pendingNativeAuth(proof, 100), callbackUrl: 'praetorium://auth?token=secret' }

    expect(parsePendingNativeAuth(JSON.stringify(pending), 200)).toEqual(pending)
  })

  it('fails closed after the exchange window or for malformed storage', () => {
    expect(parsePendingNativeAuth(JSON.stringify(pendingNativeAuth(proof, 100)), 3 * 60 * 1000 + 100)).toBeNull()
    expect(parsePendingNativeAuth('{')).toBeNull()
  })
})
