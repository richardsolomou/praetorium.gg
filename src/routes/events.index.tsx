import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignInRequired } from '../client/components/SignInRequired'
import { eventsQuery, meQuery, opponentsQuery } from '../client/queries'
import { createEvent } from '../server/functions'

export const Route = createFileRoute('/events/')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(meQuery()), context.queryClient.ensureQueryData(eventsQuery())]),
  component: EventsPage,
})

function EventsPage() {
  const { data: me } = useQuery(meQuery())
  const { data: events = [] } = useQuery(eventsQuery())
  if (!me) return <SignInRequired title="Your events" explanation="Sign in to prepare and reveal rosters with other players." />
  return (
    <main className="w-full">
      <header className="border-b border-edge bg-panel">
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-4 px-4 py-7">
          <div>
            <p className="eyebrow text-parchment">Roster reveal</p>
            <h1 className="mt-1 text-3xl">Events</h1>
            <p className="mt-2 text-sm text-dim">Prepare hidden rosters, reveal together, then decide the matchups.</p>
          </div>
          <CreateEventButton viewerId={me.id} />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-5">
        {events.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((event: (typeof events)[number]) => (
              <Link
                key={event.id}
                to="/events/$id"
                params={{ id: event.id }}
                className="border border-edge bg-panel p-4 hover:border-edge-strong hover:bg-raised"
              >
                <p className="eyebrow">{event.revealedAt ? 'Revealed' : 'Preparing'}</p>
                <h2 className="mt-1 text-xl">{event.name}</h2>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid place-items-center border border-edge bg-panel px-6 py-12 text-center">
            <CalendarDays className="size-8 text-parchment" />
            <h2 className="mt-3 text-xl">No events yet.</h2>
            <p className="mt-2 max-w-md text-sm text-dim">
              Create one, assign each player a points limit, and nobody sees another roster until everyone seals.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function CreateEventButton({ viewerId }: { viewerId: string }) {
  const { data: opponents = [] } = useQuery(opponentsQuery())
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [limits, setLimits] = useState<Record<string, number>>({ [viewerId]: 1000 })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: () => createEvent({ data: { name, participants: Object.entries(limits).map(([userId, limit]) => ({ userId, limit })) } }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: eventsQuery().queryKey })
      setOpen(false)
      await navigate({ to: '/events/$id', params: { id } })
    },
  })
  const players = [{ id: viewerId, name: 'You' }, ...opponents]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> New event
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-none border-edge bg-panel sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl uppercase">Create event</DialogTitle>
          <DialogDescription>Choose the players and the roster size each one will prepare.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="event-name">Name</Label>
          <Input
            id="event-name"
            className="mt-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sunday open play"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="eyebrow">Participants</legend>
          {players.map((player) => {
            const selected = limits[player.id] !== undefined
            return (
              <div key={player.id} className="grid grid-cols-[1fr_7rem] items-center gap-3 border border-edge bg-sunken p-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={player.id === viewerId}
                    onChange={(event) =>
                      setLimits((current) => {
                        const next = { ...current }
                        if (event.target.checked) next[player.id] = 1000
                        else delete next[player.id]
                        return next
                      })
                    }
                  />
                  {player.name}
                </label>
                <Input
                  aria-label={`${player.name} points`}
                  type="number"
                  min={1}
                  max={10000}
                  step={500}
                  disabled={!selected}
                  value={selected ? limits[player.id] : ''}
                  onChange={(event) => setLimits((current) => ({ ...current, [player.id]: Number(event.target.value) }))}
                />
              </div>
            )
          })}
        </fieldset>
        {create.error ? <p className="text-sm text-danger">{create.error.message}</p> : null}
        <DialogFooter>
          <Button disabled={!name.trim() || Object.keys(limits).length < 2 || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
