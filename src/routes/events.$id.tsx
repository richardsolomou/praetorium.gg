import { useFeatureFlagEnabled } from '@posthog/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Eye, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PlayerAvatar } from '../client/components/PlayerAvatar'
import { eventQuery, savedRostersQuery } from '../client/queries'
import { sealEventRoster, selectEventRoster } from '../server/functions'

export const Route = createFileRoute('/events/$id')({
  loader: ({ context, params }) =>
    Promise.all([context.queryClient.ensureQueryData(eventQuery(params.id)), context.queryClient.ensureQueryData(savedRostersQuery())]),
  component: EventPage,
})

function EventPage() {
  const enabled = useFeatureFlagEnabled('events-prototype')
  const { id } = Route.useParams()
  const { data: event } = useQuery(eventQuery(id))
  const { data: rosters = [] } = useQuery(savedRostersQuery())
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: eventQuery(id).queryKey })
  const select = useMutation({ mutationFn: (rosterId: string) => selectEventRoster({ data: { id, rosterId } }), onSuccess: refresh })
  const seal = useMutation({ mutationFn: () => sealEventRoster({ data: { id } }), onSuccess: refresh })
  if (!enabled || !event)
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <p className="text-dim">This event is unavailable.</p>
      </main>
    )
  const mine = event.participants.find((participant) => participant.userId === event.viewerId)
  const eligible = rosters.filter((roster) => roster.limit === mine?.limit)
  return (
    <main className="w-full">
      <header className="border-b border-edge bg-panel">
        <div className="mx-auto max-w-5xl px-4 py-7">
          <p className="eyebrow text-parchment">
            {event.revealedAt ? 'Rosters revealed' : `${event.sealedCount} of ${event.participants.length} sealed`}
          </p>
          <h1 className="mt-1 text-3xl">{event.name}</h1>
          <p className="mt-2 text-sm text-dim">
            {event.revealedAt ? 'Arrange these players into balanced battles.' : 'Every roster stays private until the final player seals.'}
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {event.participants.map((participant) => (
            <article key={participant.userId} className="border border-edge bg-panel p-4">
              <div className="flex items-center gap-3">
                <PlayerAvatar name={participant.name} image={participant.image} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg">{participant.name}</h2>
                  <p className="text-sm text-dim">{participant.limit.toLocaleString()} points</p>
                </div>
                {participant.sealedAt ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-success">
                    <Check className="size-4" /> Sealed
                  </span>
                ) : (
                  <span className="text-xs text-faint">Preparing</span>
                )}
              </div>
              <div className="mt-4 border-t border-edge pt-3">
                {participant.roster ? (
                  <div>
                    <p className="eyebrow">{event.revealedAt ? 'Revealed roster' : 'Your selection'}</p>
                    <p className="mt-1 font-semibold">{participant.roster.name}</p>
                    <p className="mt-1 text-sm text-dim">{participant.roster.limit.toLocaleString()} points</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-faint">
                    {participant.sealedAt ? <LockKeyhole className="size-4" /> : <Eye className="size-4" />}
                    {participant.sealedAt ? 'Roster sealed' : 'No roster visible'}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        {!event.revealedAt && mine ? (
          <section className="border border-edge bg-panel p-4">
            <p className="eyebrow">Your roster · {mine.limit.toLocaleString()} points</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Select value={mine.rosterId} disabled={Boolean(mine.sealedAt)} onValueChange={(value) => value && select.mutate(value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Choose a saved roster">
                    {(value: unknown) => eligible.find((roster) => roster.id === value)?.name ?? 'Choose a saved roster'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((roster) => (
                    <SelectItem key={roster.id} value={roster.id}>
                      {roster.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mine.sealedAt && mine.rosterId ? (
                <Button variant="outline" disabled={select.isPending} onClick={() => select.mutate(mine.rosterId!)}>
                  Change roster
                </Button>
              ) : (
                <Button disabled={!mine.rosterId || seal.isPending} onClick={() => seal.mutate()}>
                  <LockKeyhole /> {seal.isPending ? 'Sealing…' : 'Seal roster'}
                </Button>
              )}
            </div>
            {!eligible.length ? (
              <p className="mt-2 text-sm text-dim">You need a saved roster configured for exactly {mine.limit.toLocaleString()} points.</p>
            ) : null}
            {seal.error ? <p className="mt-2 text-sm text-danger">{seal.error.message}</p> : null}
          </section>
        ) : null}
        {event.revealedAt ? (
          <section className="border border-dashed border-edge-strong bg-sunken p-5 text-center">
            <h2 className="text-xl">Pairings come next</h2>
            <p className="mt-2 text-sm text-dim">
              For this prototype, decide matchups together and create the resulting battles from the Battles page.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  )
}
