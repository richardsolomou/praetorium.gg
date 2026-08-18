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

  if (!me) {
    return (
      <SignInRequired
        title={free ? 'You have been invited to a battle' : 'Sign in to open this battle'}
        explanation={
          free
            ? 'Sign in to take an open seat. Your name on the scoreboard is the one on your account.'
            : 'If you are one of the seated players, signing in will open the battle.'
        }
        next={`/b/${token}`}
      />
    )
  }

  if (!free) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl">This battle is full</h1>
        <p className="mt-2 text-sm text-dim">Every seat is already taken.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl">You have been invited to a battle</h1>
      <p className="mt-3 text-sm text-dim">Take an open seat as {me.name}.</p>
      <Button onClick={() => join.mutate()} disabled={join.isPending} className="mt-8 h-11 w-full text-base">
        Join the battle
      </Button>
      {join.error ? <p className="mt-3 text-sm text-destructive">{errorMessage(join.error)}</p> : null}
    </main>
  )
}
