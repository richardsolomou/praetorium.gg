import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { NATIVE_AUTH_COMPLETION_SCRIPT, nativeAuthExchangeScript } from '../../mobile/src/nativeAuth'

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

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('injected native authentication exchange', () => {
  it('puts the proof in a form body and starts a top-level navigation', () => {
    const fields: Array<{ name: string; value: string }> = []
    const form = { action: '', method: '', append: (field: { name: string; value: string }) => fields.push(field), submit: vi.fn() }
    const document = {
      createElement: (tag: string) => (tag === 'form' ? form : { name: '', type: '', value: '' }),
      documentElement: { append: vi.fn() },
    }
    const sessionStorage = storage()

    runInNewContext(nativeAuthExchangeScript(callback), {
      document,
      sessionStorage,
      window: { ReactNativeWebView: { postMessage: vi.fn() } },
    })

    expect({ action: form.action, method: form.method, fields, submitted: form.submit }).toEqual({
      action: '/api/auth/native-auth-token/exchange',
      method: 'POST',
      fields: [
        { name: 'id', type: 'hidden', value: callback.id },
        { name: 'token', type: 'hidden', value: callback.token },
        { name: 'verifier', type: 'hidden', value: callback.verifier },
        { name: 'navigation', type: 'hidden', value: '1' },
      ],
      submitted: expect.any(Function),
    })
    expect(form.submit).toHaveBeenCalledOnce()
    expect(JSON.parse(sessionStorage.getItem('praetorium.native-auth.exchange')!)).toEqual({ id: callback.id, next: callback.next })
  })

  it('acknowledges the redirect only after it reaches the bound destination', () => {
    const sessionStorage = storage()
    sessionStorage.setItem('praetorium.native-auth.exchange', JSON.stringify({ id: callback.id, next: callback.next }))
    const postMessage = vi.fn()
    const replaceState = vi.fn()

    runInNewContext(NATIVE_AUTH_COMPLETION_SCRIPT, {
      history: { state: null, replaceState },
      location: { href: `https://praetorium.gg/rosters?__native_auth=${callback.id}` },
      sessionStorage,
      URL,
      window: { ReactNativeWebView: { postMessage } },
    })

    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual({
      version: 2,
      type: 'native-auth-result',
      id: callback.id,
      ok: true,
      retryable: false,
    })
    expect(replaceState).toHaveBeenCalledWith(null, '', 'https://praetorium.gg/rosters')
  })

  it('marks a terminal exchange redirect as failed', () => {
    const sessionStorage = storage()
    sessionStorage.setItem('praetorium.native-auth.exchange', JSON.stringify({ id: callback.id, next: callback.next }))
    const postMessage = vi.fn()

    runInNewContext(NATIVE_AUTH_COMPLETION_SCRIPT, {
      history: { state: null, replaceState: vi.fn() },
      location: { href: `https://praetorium.gg/sign-in?__native_auth_error=${callback.id}` },
      sessionStorage,
      URL,
      window: { ReactNativeWebView: { postMessage } },
    })

    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual({
      version: 2,
      type: 'native-auth-result',
      id: callback.id,
      ok: false,
      retryable: false,
    })
  })

  it('ignores a success marker on a destination that was not bound', () => {
    const sessionStorage = storage()
    sessionStorage.setItem('praetorium.native-auth.exchange', JSON.stringify({ id: callback.id, next: callback.next }))
    const postMessage = vi.fn()

    runInNewContext(NATIVE_AUTH_COMPLETION_SCRIPT, {
      history: { state: null, replaceState: vi.fn() },
      location: { href: `https://praetorium.gg/profile?__native_auth=${callback.id}` },
      sessionStorage,
      URL,
      window: { ReactNativeWebView: { postMessage } },
    })

    expect(postMessage).not.toHaveBeenCalled()
  })
})
