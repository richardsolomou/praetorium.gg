import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { LeagueAdmission, LeagueVisibility } from '../../../core/league'
import { createLeague } from '../../../server/functions'
import { leaguesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

export function CreateLeague() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<LeagueVisibility>('private')
  const [admission, setAdmission] = useState<LeagueAdmission>('approval')
  const [cadence, setCadence] = useState<'one-off' | 'recurring'>('one-off')
  const [playerLimit, setPlayerLimit] = useState<number | ''>('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: () =>
      createLeague({
        data: {
          name,
          description,
          visibility,
          admission,
          playerLimit: playerLimit === '' ? null : playerLimit,
          recurring: cadence === 'recurring',
        },
      }),
    onSuccess: async ({ token, eventToken }) => {
      await queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey })
      setOpen(false)
      await navigate({ to: '/leagues/$token', params: { token }, search: { event: eventToken } })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> New league
      </DialogTrigger>
      <DialogContent className="rounded-none border border-edge bg-panel text-bone sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Create league</DialogTitle>
          <DialogDescription className="text-dim">Open roster registration for a league, tournament, or one-off event.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="league-name">Name</Label>
            <Input id="league-name" value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="league-description">Details</Label>
            <Textarea
              id="league-description"
              value={description}
              maxLength={2000}
              rows={4}
              placeholder="Format, dates, venue, and anything entrants need to know."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="league-player-limit">Player limit</Label>
            <Input
              id="league-player-limit"
              type="number"
              min={2}
              max={128}
              value={playerLimit}
              placeholder="No fixed limit"
              onChange={(event) => setPlayerLimit(event.target.value ? Number(event.target.value) : '')}
            />
            <p className="text-xs text-dim">If set, every place must be accepted and sealed before reveal.</p>
          </div>
          <Choice
            label="Events"
            value={cadence}
            options={[
              { value: 'one-off', title: 'One-off', detail: 'Run one registration and roster reveal.' },
              { value: 'recurring', title: 'Recurring', detail: 'Open fresh events from the same league page.' },
            ]}
            onChange={setCadence}
          />
          <Choice
            label="Visibility"
            value={visibility}
            options={[
              { value: 'private', title: 'Private link', detail: 'Only people with the link can find it.' },
              { value: 'public', title: 'Public', detail: 'Listed on the leagues page for everyone.' },
            ]}
            onChange={setVisibility}
          />
          <Choice
            label="Joining"
            value={admission}
            options={[
              { value: 'approval', title: 'Require approval', detail: 'You approve each request.' },
              { value: 'automatic', title: 'Automatic', detail: 'Anyone who joins is accepted.' },
            ]}
            onChange={setAdmission}
          />
          {create.error ? <p className="text-sm text-destructive">{errorMessage(create.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              Create league
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; title: string; detail: string }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`border p-3 text-left ${value === option.value ? 'border-parchment bg-raised' : 'border-edge bg-sunken hover:border-info'}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="block text-sm font-bold uppercase">{option.title}</span>
            <span className="mt-1 block text-xs text-dim">{option.detail}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
