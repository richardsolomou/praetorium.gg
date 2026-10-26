import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { classifyAuthCallbackFailure } from 'ras-stack/auth/client'
import { useAuthAction } from 'ras-stack/auth/react'
import { posthog } from 'posthog-js'
import { useEffect, useRef, useState } from 'react'
import { peekGuestDraft, GUEST_PATH, requestGuestSave } from '../rosters/guestDraft'
import { listUnitCount } from '../../../core/attachedUnits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_MIN_LENGTH, SOCIAL_AUTH_PROVIDER_NAMES } from '../../../authConfig'
import { authClient, authRedirectUrl } from '../../authClient'
import { AuthMethodIcon } from './AuthMethodIcon'
import { authFailureReason } from './authFailureReason'
import { TwoFactorSignIn } from './TwoFactorSignIn'
import { requestNativeAuth, useGithubAuthAvailability } from '../../nativeAuth'
import { signInOptionsQuery } from '../../queries'
import { useClientValue } from '../../useClientValue'
import { Problem } from '../../components/Problem'

const socialAuthErrorMessage = (error?: string) => {
  if (!error) return undefined
  switch (classifyAuthCallbackFailure(error)) {
    case 'account_not_linked':
      return 'An account already uses this email. Sign in with its existing method, then link this provider from your profile.'
    default:
      return 'Could not sign in with this provider. Try again.'
  }
}

/**
 * An account is who you are here: battles, saved lists and every command in a log
 * point at it, and there is no other way to be anyone.
 */
export function SignInPage({
  error,
  next,
  reset,
  join,
  name: suggestedName,
}: {
  error?: string
  next?: string
  reset?: boolean
  join?: boolean
  name?: string
}) {
  const { data: options } = useQuery(signInOptionsQuery())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState(suggestedName ?? '')
  const guest = useClientValue(peekGuestDraft, null)
  const savingRoster = next === GUEST_PATH && Boolean(guest)
  const gateViewed = useRef(false)
  useEffect(() => {
    if (!savingRoster || gateViewed.current) return
    gateViewed.current = true
    posthog.capture('guest_roster_save_gate_viewed', {
      action: join ? 'create' : 'sign_in',
      unit_count: listUnitCount(guest!.draft.picks),
    })
  }, [savingRoster, guest, join])
  const [joining, setJoining] = useState(Boolean(join))
  const [twoFactorPending, setTwoFactorPending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetNeedsEmail, setResetNeedsEmail] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const submit = useAuthAction()
  const callbackError = socialAuthErrorMessage(error)
  const githubAuthAvailable = useGithubAuthAvailability()
  const providers = options?.providers.filter((provider) => provider !== 'github' || githubAuthAvailable) ?? []

  // Arriving signed in then saves the list without asking whose it is.
  const keepRoster = () => {
    if (savingRoster) requestGuestSave()
  }

  const authenticate = async () => {
    keepRoster()
    posthog.capture('account_authentication_started', {
      method: 'email',
      action: joining ? 'create' : 'sign_in',
      redirected: Boolean(next),
      ...(savingRoster ? { purpose: 'guest_roster' } : {}),
    })
    const result = await submit.run(() =>
      joining
        ? authClient.signUp.email({
            email,
            password,
            name: name.trim(),
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
      await queryClient.invalidateQueries()
      const redirectUrl = authRedirectUrl('data' in result ? result.data : null)
      if (redirectUrl) {
        window.location.replace(redirectUrl)
        return
      }
      // `next` is a pathname rather than a route, so this is a navigation by href
      // rather than by route id.
      if (next) window.location.replace(next)
      else await navigate({ to: '/', replace: true })
    } else {
      posthog.capture('account_authentication_failed', {
        method: 'email',
        action: joining ? 'create' : 'sign_in',
        reason: authFailureReason(result.error),
      })
    }
  }

  return (
    <main className="grid w-full flex-1 md:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-edge bg-sunken md:block">
        <div className="plot-grid" />
        <div className="relative ml-auto grid h-full w-full max-w-lg grid-rows-[auto_1fr] p-8">
          <div>
            <p className="eyebrow text-parchment">Build. Plan. Play.</p>
            <h2 className="mt-1 text-3xl">Your armies and battles, ready when you are.</h2>
          </div>
          <img src="/logo.svg" alt="" className="mx-auto size-40 self-center" />
        </div>
      </aside>
      <section className="border-b border-edge bg-panel">
        <div className="mr-auto h-full w-full max-w-lg p-6 sm:p-8">
          <p className="eyebrow text-parchment">{joining ? 'Create account' : 'Sign in'}</p>
          <h1 className="mt-1 text-3xl">{savingRoster ? 'Save your roster' : joining ? 'Join Praetorium' : 'Welcome back'}</h1>
          {savingRoster || joining ? (
            <p className="mt-3 text-sm text-dim">
              {savingRoster
                ? 'Create a free account or sign in. Your roster will be saved to that account, then you will return to your army. Until saving succeeds, the draft stays on this device.'
                : 'Save your army lists and play battles with friends. Free.'}
            </p>
          ) : null}
          {savingRoster && guest ? (
            <Link
              to="/rosters/$id"
              params={{ id: guest.id }}
              className="mt-3 inline-block text-sm text-info underline underline-offset-2"
              onClick={() => posthog.capture('guest_roster_save_gate_interacted', { action: 'return_to_draft' })}
            >
              Back to your roster
            </Link>
          ) : null}
          {callbackError ? <Problem className="mt-6 border border-destructive/40 bg-destructive/10 p-3">{callbackError}</Problem> : null}
          {reset ? (
            <output className="mt-6 block border border-achieved/40 bg-achieved/10 p-3 text-sm text-achieved">
              Sign in with your new password.
            </output>
          ) : null}
          {twoFactorPending ? (
            <TwoFactorSignIn
              onBack={() => setTwoFactorPending(false)}
              onSuccess={(redirectUrl) => {
                if (redirectUrl || next) window.location.replace(redirectUrl || next!)
                else void navigate({ to: '/', replace: true })
              }}
            />
          ) : (
            <>
              <form
                className="mt-8 space-y-4"
                onInvalidCapture={(event) => {
                  if (!savingRoster) return
                  const field = (event.target as HTMLInputElement).id
                  if (field === 'name' || field === 'email' || field === 'password')
                    posthog.capture('guest_roster_save_validation_failed', { field, action: joining ? 'create' : 'sign_in' })
                }}
                onSubmit={(event) => {
                  event.preventDefault()
                  void authenticate()
                }}
              >
                {joining ? (
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name</Label>
                    <Input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" required />
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
                  {savingRoster
                    ? joining
                      ? 'Create account and save roster'
                      : 'Sign in and save roster'
                    : joining
                      ? 'Create account'
                      : 'Sign in'}
                </Button>
                {submit.error ? <Problem>{submit.error}</Problem> : null}
                {!joining && options?.passwordReset ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    disabled={submit.busy}
                    onClick={async () => {
                      setResetSent(false)
                      submit.clearError()
                      if (!email) {
                        setResetNeedsEmail(true)
                        document.getElementById('email')?.focus()
                        return
                      }
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
                {resetNeedsEmail && !email ? <output className="block text-sm text-dim">Enter your email first.</output> : null}
              </form>

              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  if (savingRoster)
                    posthog.capture('guest_roster_save_gate_interacted', { action: joining ? 'switch_to_sign_in' : 'switch_to_create' })
                  setJoining((current) => !current)
                  setResetSent(false)
                  submit.clearError()
                }}
              >
                {joining ? 'I already have an account' : 'I need an account'}
              </Button>

              {providers.length ? (
                <div className="mt-6 space-y-2 border-t border-edge pt-6">
                  {providers.map((provider) => (
                    <Button
                      key={provider}
                      variant="outline"
                      className="h-11 w-full text-base"
                      onClick={async () => {
                        keepRoster()
                        posthog.capture('account_authentication_started', {
                          method: provider,
                          action: joining ? 'create' : 'sign_in',
                          redirected: Boolean(next),
                          ...(savingRoster ? { purpose: 'guest_roster' } : {}),
                        })
                        if (
                          await requestNativeAuth({
                            action: 'sign-in',
                            provider,
                            next: next ?? '/',
                            requestSignUp: joining,
                          })
                        )
                          return
                        const errorSearch = new URLSearchParams()
                        if (next) errorSearch.set('next', next)
                        if (joining) errorSearch.set('join', 'true')
                        const errorCallbackURL = errorSearch.size ? `/sign-in?${errorSearch}` : '/sign-in'
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
