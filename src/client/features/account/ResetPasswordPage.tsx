import { Link } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { useAuthAction } from 'ras-stack/auth/react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_MIN_LENGTH } from '../../../authConfig'
import { authClient } from '../../authClient'
import { Problem } from '../../components/Problem'
import { AuthAside } from './AuthAside'

export function ResetPasswordPage({ token, tokenError, next }: { token?: string; tokenError?: string; next?: string }) {
  const [password, setPassword] = useState('')
  const submit = useAuthAction({ failureMessage: () => 'Could not reset the password. Request a new reset link and try again.' })
  const invalid = tokenError || !token

  return (
    <main className="grid w-full flex-1 md:grid-cols-2">
      <AuthAside heading="Return to the battle." caption="Choose a new password for your Praetorium account." />
      <section className="grid md:items-center">
        <div className="mr-auto w-full max-w-lg px-5 py-8 sm:p-8 lg:p-12">
          <h1 className="text-4xl leading-none">Reset password</h1>
          {invalid ? (
            <>
              <Problem className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                This password reset link is invalid or has expired.
              </Problem>
              <Link
                to="/sign-in"
                search={{ next, error: undefined, reset: undefined }}
                className={buttonClass({ className: 'mt-6 h-11 text-base' })}
              >
                Return to sign in
              </Link>
            </>
          ) : (
            <form
              className="mt-8 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault()
                const result = await submit.run(() => authClient.resetPassword({ newPassword: password, token }))
                if (!result.error) {
                  const search = new URLSearchParams({ reset: 'true' })
                  if (next) search.set('next', next)
                  posthog.reset()
                  window.location.replace(`/sign-in?${search}`)
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-dim">At least {PASSWORD_MIN_LENGTH} characters.</p>
              </div>
              <Button type="submit" className="h-11 w-full text-base" disabled={submit.busy}>
                {submit.busy ? 'Resetting…' : 'Reset password'}
              </Button>
              {submit.error ? <Problem>{submit.error}</Problem> : null}
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
