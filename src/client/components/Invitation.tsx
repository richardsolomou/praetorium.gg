import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { joinBattle } from '../../server/functions'
import { meQuery } from '../queries'
import { errorMessage } from '../queryClient'
import { SignInRequired } from './SignInRequired'

/** What the link shows someone who has not taken a seat yet. */
export function Invitation({ token, free }: { token: string; free: boolean }) {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const join = useMutation({
    mutationFn: () => joinBattle({ data: { token } }),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  if (!free) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl">This battle is full</h1>
        <p className="mt-2 text-sm text-dim">Two players are already in it.</p>
      </main>
    )
  }

  // Signing in comes back here rather than to the front page, so the link still
  // does what it said it would.
  if (!me) {
    return (
      <SignInRequired
        title="You have been invited to a battle"
        explanation="Sign in to take the second seat. Your name on the scoreboard is the one on your account."
        next={`/b/${token}`}
      />
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl">You have been invited to a battle</h1>
      <p className="mt-3 text-sm text-dim">Take the second seat as {me.name}.</p>
      <Button onClick={() => join.mutate()} disabled={join.isPending} className="mt-8 h-11 w-full text-base">
        Join the battle
      </Button>
      {join.error ? <p className="mt-3 text-sm text-destructive">{errorMessage(join.error)}</p> : null}
    </main>
  )
}
