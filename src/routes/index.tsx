import { useMutation } from '@tanstack/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { meQuery } from '../client/queries'
import { errorMessage } from '../client/queryClient'
import { PLAYER_NAME_MAX_LENGTH } from '../core/battle'
import { createBattle } from '../server/fns'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: Home,
})

function Home() {
  const { data: me } = useSuspenseQuery(meQuery())
  const [name, setName] = useState(me?.name ?? '')
  const navigate = useNavigate()
  const open = useMutation({
    mutationFn: () => createBattle({ data: { name } }),
    onSuccess: ({ token }) => navigate({ to: '/b/$token', params: { token } }),
  })

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl">Track a battle together</h1>
      <p className="mt-3 text-sm text-dim">
        Open a battle, send the link to your opponent, and you both watch the same round, phase and score. Whoever the rules say owns a move
        is the only one who can make it.
      </p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          open.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={PLAYER_NAME_MAX_LENGTH}
            placeholder="Richard"
            autoComplete="nickname"
          />
        </div>
        <Button type="submit" disabled={!name.trim() || open.isPending} className="h-11 w-full text-base">
          Open a battle
        </Button>
        {open.error ? <p className="text-sm text-destructive">{errorMessage(open.error)}</p> : null}
      </form>
    </main>
  )
}
