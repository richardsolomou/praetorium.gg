import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { identifyPlayer } from '../../server/fns'
import { meQuery } from '../queries'

export function IdentityGate() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const identify = useMutation({
    mutationFn: () => identifyPlayer({ data: { name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQuery().queryKey }),
  })

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl">Choose your player name</h1>
      <p className="mt-2 text-sm text-dim">No account needed. This name keeps your battles and rosters on this device.</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          identify.mutate()
        }}
      >
        <Label htmlFor="player-name">Your name</Label>
        <Input id="player-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" />
        <Button type="submit" className="w-full" disabled={!name.trim() || identify.isPending}>
          Continue
        </Button>
      </form>
    </div>
  )
}
