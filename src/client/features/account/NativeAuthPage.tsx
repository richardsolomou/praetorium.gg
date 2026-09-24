import { useEffect, useRef, useState } from 'react'
import { posthog } from 'posthog-js'
import type { SocialAuthProvider } from '../../../authConfig'
import { authClient } from '../../authClient'
import type { NativeAuthAction } from '../../nativeAuth'

const NATIVE_AUTH_CALLBACK = 'praetorium://auth'

export type NativeAuthSearch = {
  action?: NativeAuthAction
  complete?: boolean
  error?: string
  next?: string
  provider?: SocialAuthProvider
  requestSignUp?: boolean
  bridge?: 1 | 2 | 3
  challenge?: string
}

function nativeAuthPath(
  search: Required<Pick<NativeAuthSearch, 'action' | 'bridge' | 'next' | 'provider'>> & {
    challenge?: string
    complete?: boolean
    requestSignUp?: boolean
  },
) {
  const query = new URLSearchParams({ action: search.action, next: search.next, provider: search.provider })
  query.set('bridge', String(search.bridge))
  if (search.challenge) query.set('challenge', search.challenge)
  if (search.complete) query.set('complete', 'true')
  if (search.requestSignUp) query.set('requestSignUp', 'true')
  return `/native-auth?${query}`
}

function returnToApplication(
  search: Required<Pick<NativeAuthSearch, 'action' | 'bridge' | 'next' | 'provider'>>,
  exchange?: { id?: string; token: string },
  challenge?: string,
) {
  const callback = new URL(NATIVE_AUTH_CALLBACK)
  callback.searchParams.set('action', search.action)
  callback.searchParams.set('next', search.next)
  callback.searchParams.set('provider', search.provider)
  callback.searchParams.set('version', String(search.bridge))
  if (challenge) callback.searchParams.set('challenge', challenge)
  if (exchange) {
    callback.searchParams.set('token', exchange.token)
    if (exchange.id) callback.searchParams.set('id', exchange.id)
  } else callback.searchParams.set('error', 'authentication_failed')
  window.location.replace(callback.toString())
}

export function NativeAuthPage({ search }: { search: NativeAuthSearch }) {
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const { action, bridge, challenge, next = '/rosters', provider } = search
    if (!action || !bridge || !provider || (bridge >= 2 && !challenge)) {
      setFailed(true)
      return
    }

    const finish = async () => {
      if (search.error) {
        posthog.capture('account_authentication_failed', { action, method: provider, native: true })
        returnToApplication({ action, bridge, next, provider }, undefined, challenge)
        return
      }
      const exchange =
        bridge >= 2
          ? await fetch('/api/auth/native-auth-token/generate', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action, challenge, provider, next }),
            }).then(async (response) => (response.ok ? ((await response.json()) as { id: string; token: string }) : null))
          : await authClient.oneTimeToken
              .generate()
              .then((result) => (result.error || !result.data?.token ? null : { token: result.data.token }))
      if (!exchange) {
        setFailed(true)
        return
      }
      posthog.capture(search.requestSignUp ? 'account_created' : action === 'link' ? 'sign_in_method_added' : 'account_signed_in', {
        method: provider,
        native: true,
        redirected: next !== '/rosters',
      })
      returnToApplication({ action, bridge, next, provider }, exchange, challenge)
    }

    const begin = async () => {
      if (action === 'link') {
        const sessionToken = new URLSearchParams(window.location.hash.slice(1)).get('session')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
        if (!sessionToken) throw new Error('missing session token')
        const exchanged = await authClient.oneTimeToken.verify({ token: sessionToken })
        if (exchanged.error) throw exchanged.error
        const linked = await authClient.linkSocial({
          provider,
          callbackURL: nativeAuthPath({ action, bridge, challenge, complete: true, next, provider }),
          errorCallbackURL: nativeAuthPath({ action, bridge, challenge, complete: true, next, provider }),
        })
        if (linked.error) throw linked.error
        return
      }
      const signedIn = await authClient.signIn.social({
        provider,
        callbackURL: nativeAuthPath({ action, bridge, challenge, complete: true, next, provider, requestSignUp: search.requestSignUp }),
        errorCallbackURL: nativeAuthPath({
          action,
          bridge,
          challenge,
          complete: true,
          next,
          provider,
          requestSignUp: search.requestSignUp,
        }),
        requestSignUp: search.requestSignUp,
      })
      if (signedIn.error) throw signedIn.error
    }

    void (search.complete ? finish() : begin()).catch((error: unknown) => {
      posthog.captureException(error, { operation: 'native_auth' })
      setFailed(true)
    })
  }, [search])

  return (
    <main className="grid place-items-center p-6 text-center">
      <div className="max-w-sm border border-edge bg-panel p-6">
        <p className="eyebrow text-parchment">Praetorium account</p>
        <h1 className="mt-1 text-2xl">{failed ? 'Sign-in did not finish' : 'Completing secure sign-in'}</h1>
        <p className="mt-3 text-sm text-dim">
          {failed ? 'Close this window, return to Praetorium and try again.' : 'You will return to the application automatically.'}
        </p>
      </div>
    </main>
  )
}
