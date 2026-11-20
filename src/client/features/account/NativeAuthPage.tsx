import { useEffect, useRef, useState } from 'react'
import { posthog } from 'posthog-js'
import type { SocialAuthProvider } from '../../../authConfig'
import { authClient } from '../../authClient'
import { nativeAuthExchange, startNativeLink, type NativeAuthAction } from '../../nativeAuth'
import { captureAuthFailure } from './authFailureReason'

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

/** The proof the provider's answer left in the address, which only the shell that asked can use. */
function linkProof() {
  const proof = new URLSearchParams(window.location.hash.slice(1))
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  const id = proof.get('id')
  const token = proof.get('token')
  return id && token ? { id, token } : null
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

/** The request a native shell sent, or null when it lacks what the exchange needs. */
function nativeAuthRequest({ action, bridge, challenge, next = '/rosters', provider }: NativeAuthSearch) {
  if (!action || !bridge || !provider || (bridge >= 2 && !challenge)) return null
  return { action, bridge, challenge, next, provider }
}

export function NativeAuthPage({ search }: { search: NativeAuthSearch }) {
  const started = useRef(false)
  const [failed, setFailed] = useState(false)
  const incomplete = !nativeAuthRequest(search)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const request = nativeAuthRequest(search)
    if (!request) return
    const { action, bridge, challenge, next, provider } = request

    const finish = async () => {
      if (search.error) {
        captureAuthFailure(search.error, { action, method: provider, native: true })
        returnToApplication({ action, bridge, next, provider }, undefined, challenge)
        return
      }
      const exchange =
        action === 'link'
          ? linkProof()
          : bridge >= 2
            ? await nativeAuthExchange({ action, challenge, provider, next })
            : await authClient.oneTimeToken
                .generate()
                .then((result) => (result.error || !result.data?.token ? null : { token: result.data.token }))
      if (!exchange) {
        posthog.capture('account_authentication_failed', { action, method: provider, native: true, reason: 'exchange_failed' })
        setFailed(true)
        return
      }
      returnToApplication({ action, bridge, next, provider }, exchange, challenge)
    }

    const begin = async () => {
      if (action === 'link') {
        // A shell from before this proof also sends its session here, which this browser has no use for.
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
        if (bridge < 2 || !challenge) throw new Error('this app is too old to link a provider')
        const url = await startNativeLink({ bridge: bridge as 2 | 3, challenge, provider, next })
        if (!url) throw new Error('link could not start')
        window.location.assign(url)
        return
      }
      const back = nativeAuthPath({ action, bridge, challenge, complete: true, next, provider, requestSignUp: search.requestSignUp })
      const signedIn = await authClient.signIn.social({
        provider,
        callbackURL: back,
        errorCallbackURL: back,
        requestSignUp: search.requestSignUp,
      })
      if (signedIn.error) throw signedIn.error
    }

    void (search.complete ? finish() : begin()).catch((error: unknown) => {
      posthog.captureException(error, { operation: 'native_auth' })
      captureAuthFailure(error, { action, method: provider, native: true })
      setFailed(true)
    })
  }, [search])

  return (
    <main className="grid place-items-center p-6 text-center">
      <div className="max-w-sm part p-6">
        <h1 className="text-2xl">{incomplete || failed ? 'Sign-in did not finish' : 'Completing secure sign-in'}</h1>
        <p className="mt-3 text-sm text-dim">
          {incomplete || failed
            ? 'Close this window, return to Praetorium and try again.'
            : 'You will return to the application automatically.'}
        </p>
      </div>
    </main>
  )
}
