import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '../client/authClient'
import { signInOptionsQuery } from '../client/queries'
import { errorMessage } from '../client/queryClient'
import { PASSWORD_MIN_LENGTH } from '../authConfig'

export const Route = createFileRoute('/signin')({
  // Where the visitor was going before they were asked to sign in. An invite link
  // puts the battle here, so signing in lands in the battle rather than at home.
  // Only ever a path on this instance: an absolute or protocol-relative URL here
  // would turn the sign-in page into an open redirect.
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === 'string' && /^\/(?!\/)/.test(search.next) ? search.next : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(signInOptionsQuery()),
  component: SignIn,
})

/**
 * An account is who you are here: battles, saved lists and every command in a log
 * point at it, and there is no other way to be anyone.
 */
function SignIn() {
  const { next } = Route.useSearch()
  const { data: options } = useQuery(signInOptionsQuery())
  const [email, setEmail] = useState(options?.previewLogin?.email ?? '')
  const [password, setPassword] = useState(options?.previewLogin?.password ?? '')
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const submit = useMutation({
    mutationFn: async () => {
      const result = joining
        ? await authClient.signUp.email({ email, password, name: name.trim() || email.split('@')[0] || 'Player' })
        : await authClient.signIn.email({ email, password })
      if (result.error) throw new Error(result.error.message ?? 'that did not work')
      return result
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      // `next` is a pathname rather than a route, so this is a navigation by href
      // rather than by route id.
      if (next) window.location.assign(next)
      else await navigate({ to: '/rosters' })
    },
  })

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl">{joining ? 'Make an account' : 'Welcome back'}</h1>
      <p className="mt-3 text-sm text-dim">
        Your account is your player: it holds your saved lists, the battles you have played and the ones still going, on whatever device you
        pick up.
      </p>
      {options?.previewLogin ? <p className="mt-3 text-sm text-dim">This preview login is ready to use.</p> : null}

      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit.mutate()
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
          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
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
        <Button type="submit" className="h-11 w-full text-base" disabled={submit.isPending}>
          {joining ? 'Create the account' : 'Sign in'}
        </Button>
        {submit.error ? <p className="text-sm text-destructive">{errorMessage(submit.error)}</p> : null}
      </form>

      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setJoining((current) => !current)}>
        {joining ? 'I already have an account' : 'I need an account'}
      </Button>

      {options?.providers.length ? (
        <div className="mt-6 space-y-2 border-t border-edge pt-6">
          {options.providers.map((provider) => (
            <Button
              key={provider}
              variant="outline"
              className="h-11 w-full text-base capitalize"
              onClick={() => void authClient.signIn.social({ provider, callbackURL: next ?? '/rosters' })}
            >
              Continue with {provider}
            </Button>
          ))}
        </div>
      ) : null}
    </main>
  )
}
