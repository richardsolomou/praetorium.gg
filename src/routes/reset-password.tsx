import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { localRedirectPath } from 'ras-stack/auth/client'
import { useAuthAction } from 'ras-stack/auth/react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_MIN_LENGTH } from '../authConfig'
import { authClient } from '../client/authClient'
import { finishPasswordRecovery } from '../client/passwordRecovery'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
    next: localRedirectPath(search.next),
  }),
  component: ResetPassword,
})

function ResetPassword() {
  const { token, error: tokenError, next } = Route.useSearch()
  const [password, setPassword] = useState('')
  const submit = useAuthAction({ failureMessage: () => 'Could not reset the password. Request a new reset link and try again.' })
  const invalid = tokenError || !token

  return (
    <main className="grid w-full flex-1 md:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-edge bg-sunken md:block">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,transparent_30%,color-mix(in_srgb,var(--color-parchment)_10%,transparent),transparent_75%)]" />
        <div className="relative ml-auto grid h-full w-full max-w-lg content-between p-8">
          <div>
            <p className="eyebrow text-parchment">Praetorium account</p>
            <h2 className="mt-2 text-3xl">Return to the battle.</h2>
          </div>
          <img src="/logo.svg" alt="" className="mx-auto size-40 drop-shadow-[0_0_2rem_rgba(137,184,157,0.18)]" />
          <p className="text-sm text-dim">Choose a new password for your Praetorium account.</p>
        </div>
      </aside>
      <section className="border-b border-edge bg-panel md:border-l">
        <div className="mr-auto h-full w-full max-w-lg p-6 sm:p-8">
          <p className="eyebrow text-parchment">Account recovery</p>
          <h1 className="mt-1 text-3xl">Reset password</h1>
          {invalid ? (
            <>
              <p role="alert" className="mt-6 border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                This password reset link is invalid or has expired.
              </p>
              <Link to="/sign-in" search={{ next, error: undefined, reset: undefined }} className={buttonVariants({ className: 'mt-6' })}>
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
                  finishPasswordRecovery(`/sign-in?${search}`)
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
              {submit.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {submit.error}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
