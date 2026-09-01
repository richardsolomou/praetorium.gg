import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { classifyAuthCallbackFailure, localRedirectPath } from 'ras-stack/auth/client'
import { useAuthAction } from 'ras-stack/auth/react'
import posthog from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '../client/authClient'
import { AuthMethodIcon, SOCIAL_AUTH_PROVIDER_NAMES } from '../client/components/AuthMethodIcon'
import { requestNativeAuth } from '../client/nativeAuth'
import { signedInDestination } from '../client/signInGuard'
import { TwoFactorSignIn } from '../client/components/TwoFactorSignIn'
import { signInOptionsQuery } from '../client/queries'
import { PASSWORD_MIN_LENGTH } from '../authConfig'

const socialAuthErrorMessage = (error?: string) => {
  if (!error) return undefined
  switch (classifyAuthCallbackFailure(error)) {
    case 'account_not_linked':
      return 'An account already uses this email. Sign in with its existing method, then link this provider from your profile.'
    default:
      return 'Could not sign in with this provider. Try again.'
  }
}

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { next?: string; error?: string; reset?: boolean } = {}
    result.next = localRedirectPath(search.next)
    if (typeof search.error === 'string' && search.error) result.error = search.error
    if (search.reset === true || search.reset === 'true') result.reset = true
    return result
  },
  beforeLoad: async ({ context, search }) => {
    const destination = await signedInDestination(context.queryClient, search.next)
    if (destination) throw redirect({ href: destination, replace: true })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(signInOptionsQuery()),
  component: SignIn,
})

/**
 * An account is who you are here: battles, saved lists and every command in a log
 * point at it, and there is no other way to be anyone.
 */
function SignIn() {
  const { error, next, reset } = Route.useSearch()
  const { data: options } = useQuery(signInOptionsQuery())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [twoFactorPending, setTwoFactorPending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const submit = useAuthAction()
  const callbackError = socialAuthErrorMessage(error)

  const authenticate = async () => {
    const result = await submit.run(() =>
      joining
        ? authClient.signUp.email({
            email,
            password,
            name: name.trim() || email.split('@')[0] || 'Player',
            callbackURL: '/profile?verified=true',
          })
        : authClient.signIn.email({ email, password }),
    )
    if (
      !result.error &&
      !joining &&
      'data' in result &&
      result.data &&
      'twoFactorRedirect' in result.data &&
      result.data.twoFactorRedirect
    ) {
      setTwoFactorPending(true)
      return
    }
    if (!result.error) {
      posthog.capture(joining ? 'account_created' : 'account_signed_in', { method: 'email', redirected: Boolean(next) })
      await queryClient.invalidateQueries()
      // `next` is a pathname rather than a route, so this is a navigation by href
      // rather than by route id.
      if (next) window.location.replace(next)
      else await navigate({ to: '/', replace: true })
    } else {
      posthog.capture('account_authentication_failed', { method: 'email', action: joining ? 'create' : 'sign_in' })
    }
  }

  return (
    <main className="grid w-full flex-1 md:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-edge bg-sunken md:block">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,transparent_30%,color-mix(in_srgb,var(--color-parchment)_10%,transparent),transparent_75%)]" />
        <div className="relative ml-auto grid h-full w-full max-w-lg content-between p-8">
          <div>
            <p className="eyebrow text-parchment">Praetorium account</p>
            <h2 className="mt-2 text-3xl">One player. Every battle.</h2>
          </div>
          <img src="/logo.svg" alt="" className="mx-auto size-40 drop-shadow-[0_0_2rem_rgba(137,184,157,0.18)]" />
          <p className="text-sm text-dim">Your rosters, friendships, and battle history follow your account across devices.</p>
        </div>
      </aside>
      <section className="border-b border-edge bg-panel md:border-l">
        <div className="mr-auto h-full w-full max-w-lg p-6 sm:p-8">
          <p className="eyebrow text-parchment">{joining ? 'Create account' : 'Sign in'}</p>
          <h1 className="mt-1 text-3xl">{joining ? 'Make an account' : 'Welcome back'}</h1>
          <p className="mt-3 text-sm text-dim">
            Your account is your player: it holds your saved lists, the battles you have played and the ones still going, on whatever device
            you pick up.
          </p>
          {callbackError ? (
            <p role="alert" className="mt-6 border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {callbackError}
            </p>
          ) : null}
          {reset ? (
            <output className="mt-6 block border border-achieved/40 bg-achieved/10 p-3 text-sm text-achieved">
              Sign in with your new password.
            </output>
          ) : null}
          {twoFactorPending ? (
            <TwoFactorSignIn
              onBack={() => setTwoFactorPending(false)}
              onSuccess={() => {
                posthog.capture('account_signed_in', { method: 'two_factor', redirected: Boolean(next) })
                if (next) window.location.replace(next)
                else void navigate({ to: '/', replace: true })
              }}
            />
          ) : (
            <>
              <form
                className="mt-8 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void authenticate()
                }}
              >
                {joining ? (
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name</Label>
                    <Input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={joining ? 'new-password' : 'current-password'}
                    minLength={PASSWORD_MIN_LENGTH}
                    required
                  />
                  {joining ? <p className="text-xs text-dim">At least {PASSWORD_MIN_LENGTH} characters.</p> : null}
                </div>
                <Button type="submit" className="h-11 w-full text-base" disabled={submit.busy}>
                  {joining ? 'Create the account' : 'Sign in'}
                </Button>
                {submit.error ? <p className="text-sm text-destructive">{submit.error}</p> : null}
                {!joining && options?.passwordReset ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    disabled={submit.busy || !email}
                    onClick={async () => {
                      setResetSent(false)
                      submit.clearError()
                      const redirectTo = next ? `/reset-password?${new URLSearchParams({ next })}` : '/reset-password'
                      const result = await submit.run(() => authClient.requestPasswordReset({ email, redirectTo }))
                      if (!result.error) {
                        setResetSent(true)
                        posthog.capture('password_reset_requested')
                      }
                    }}
                  >
                    Forgot password?
                  </Button>
                ) : null}
                {resetSent ? <output className="block text-sm text-dim">If that account exists, a reset link has been sent.</output> : null}
              </form>

              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setJoining((current) => !current)
                  setResetSent(false)
                  submit.clearError()
                }}
              >
                {joining ? 'I already have an account' : 'I need an account'}
              </Button>

              {options?.providers.length ? (
                <div className="mt-6 space-y-2 border-t border-edge pt-6">
                  {options.providers.map((provider) => (
                    <Button
                      key={provider}
                      variant="outline"
                      className="h-11 w-full text-base"
                      onClick={async () => {
                        posthog.capture('account_authentication_started', { method: provider, redirected: Boolean(next) })
                        if (
                          await requestNativeAuth({
                            action: 'sign-in',
                            provider,
                            next: next ?? '/',
                            requestSignUp: joining,
                          })
                        )
                          return
                        const errorCallbackURL = next ? `/sign-in?${new URLSearchParams({ next })}` : '/sign-in'
                        void authClient.signIn.social({
                          provider,
                          callbackURL: next ?? '/',
                          errorCallbackURL,
                          requestSignUp: joining,
                        })
                      }}
                    >
                      <AuthMethodIcon method={provider} />
                      Continue with {SOCIAL_AUTH_PROVIDER_NAMES[provider]}
                    </Button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
