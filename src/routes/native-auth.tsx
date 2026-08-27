import { createFileRoute } from '@tanstack/react-router'
import { localRedirectPath } from 'ras-stack/auth/client'
import { useEffect, useRef, useState } from 'react'
import posthog from 'posthog-js'
import { SOCIAL_PROVIDERS, type SocialAuthProvider } from '../authConfig'
import { authClient } from '../client/authClient'
import type { NativeAuthAction } from '../client/nativeAuth'

const NATIVE_AUTH_CALLBACK = 'praetorium://auth'

type NativeAuthSearch = {
  action?: NativeAuthAction
  complete?: boolean
  error?: string
  next?: string
  provider?: SocialAuthProvider
  requestSignUp?: boolean
}

export const Route = createFileRoute('/native-auth')({
  validateSearch: (search: Record<string, unknown>): NativeAuthSearch => ({
    action: search.action === 'link' || search.action === 'sign-in' ? search.action : undefined,
    complete: search.complete === true || search.complete === 'true' || undefined,
    error: typeof search.error === 'string' && search.error ? search.error : undefined,
    next: localRedirectPath(search.next),
    provider: SOCIAL_PROVIDERS.find((provider) => provider === search.provider),
    requestSignUp: search.requestSignUp === true || search.requestSignUp === 'true' || undefined,
  }),
  component: NativeAuth,
})

function nativeAuthPath(
  search: Required<Pick<NativeAuthSearch, 'action' | 'next' | 'provider'>> & { complete?: boolean; requestSignUp?: boolean },
) {
  const query = new URLSearchParams({ action: search.action, next: search.next, provider: search.provider })
  if (search.complete) query.set('complete', 'true')
  if (search.requestSignUp) query.set('requestSignUp', 'true')
  return `/native-auth?${query}`
}

function returnToApplication(search: Required<Pick<NativeAuthSearch, 'action' | 'next' | 'provider'>>, token?: string) {
  const callback = new URL(NATIVE_AUTH_CALLBACK)
  callback.searchParams.set('action', search.action)
  callback.searchParams.set('next', search.next)
  callback.searchParams.set('provider', search.provider)
  if (token) callback.searchParams.set('token', token)
  else callback.searchParams.set('error', 'authentication_failed')
  window.location.replace(callback.toString())
}

function NativeAuth() {
  const search = Route.useSearch()
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const { action, next = '/rosters', provider } = search
    if (!action || !provider) {
      setFailed(true)
      return
    }

    const finish = async () => {
      if (search.error) {
        posthog.capture('account_authentication_failed', { action, method: provider, native: true })
        returnToApplication({ action, next, provider })
        return
      }
      const token = await authClient.oneTimeToken.generate()
      if (token.error || !token.data?.token) {
        setFailed(true)
        return
      }
      posthog.capture(search.requestSignUp ? 'account_created' : action === 'link' ? 'sign_in_method_added' : 'account_signed_in', {
        method: provider,
        native: true,
        redirected: next !== '/rosters',
      })
      returnToApplication({ action, next, provider }, token.data.token)
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
          callbackURL: nativeAuthPath({ action, complete: true, next, provider }),
          errorCallbackURL: nativeAuthPath({ action, complete: true, next, provider }),
        })
        if (linked.error) throw linked.error
        return
      }
      const signedIn = await authClient.signIn.social({
        provider,
        callbackURL: nativeAuthPath({ action, complete: true, next, provider, requestSignUp: search.requestSignUp }),
        errorCallbackURL: nativeAuthPath({ action, complete: true, next, provider, requestSignUp: search.requestSignUp }),
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
        <h1 className="mt-2 text-2xl">{failed ? 'Sign-in did not finish' : 'Completing secure sign-in'}</h1>
        <p className="mt-3 text-sm text-dim">
          {failed ? 'Close this window, return to Praetorium and try again.' : 'You will return to the application automatically.'}
        </p>
      </div>
    </main>
  )
}
