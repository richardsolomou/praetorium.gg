import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PLAYER_NAME_MAX_LENGTH } from '../../core/battle'
import { joinBattle } from '../../server/fns'
import { errorMessage } from '../queryClient'

/** What the link shows someone who has not taken a seat yet. */
export function Invitation({ token, free }: { token: string; free: boolean }) {
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const join = useMutation({
    mutationFn: () => joinBattle({ data: { token, name } }),
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

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl">You have been invited to a battle</h1>
      <p className="mt-3 text-sm text-dim">Take the second seat. No account needed.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          join.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={PLAYER_NAME_MAX_LENGTH}
            autoComplete="nickname"
          />
        </div>
        <Button type="submit" disabled={!name.trim() || join.isPending} className="h-11 w-full text-base">
          Join the battle
        </Button>
        {join.error ? <p className="text-sm text-destructive">{errorMessage(join.error)}</p> : null}
      </form>
    </main>
  )
}
