import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { nativeAuthExchangeScript } from '../../mobile/src/nativeAuth'

const callback = {
  kind: 'success' as const,
  token: 'secret-token-1234',
  id: 'exchange-id-123456789012345678901',
  provider: 'google' as const,
  action: 'sign-in' as const,
  next: '/rosters',
  challenge: 'c'.repeat(43),
  verifier: 'v'.repeat(43),
}

function exchangeResult(fetch: () => Promise<Response>) {
  return new Promise<Record<string, unknown>>((resolve) => {
    runInNewContext(nativeAuthExchangeScript(callback), {
      fetch,
      window: {
        ReactNativeWebView: { postMessage: (message: string) => resolve(JSON.parse(message)) },
        location: { replace: () => undefined },
      },
    })
  })
}

describe('injected native authentication exchange', () => {
  it.each([
    ['a network rejection', async () => Promise.reject(new Error('offline'))],
    ['a server error', async () => new Response(null, { status: 503 })],
    ['a malformed success response', async () => new Response('{', { status: 200 })],
  ])('preserves the exchange proof after %s', async (_name, fetch) => {
    await expect(exchangeResult(fetch)).resolves.toMatchObject({ id: callback.id, ok: false, retryable: true })
  })

  it('marks an invalid or expired exchange as terminal', async () => {
    await expect(exchangeResult(async () => new Response(null, { status: 400 }))).resolves.toMatchObject({
      id: callback.id,
      ok: false,
      retryable: false,
    })
  })
})
