import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarPlus, Check, Eye, FileLock2, LockKeyhole, ShieldCheck, Swords, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlayerAvatar } from '../PlayerAvatar'
import { errorMessage } from '../../queryClient'
import {
  battlesQuery,
  factionIndexQuery,
  gameReferencesQuery,
  leagueQuery,
  leaguesQuery,
  meQuery,
  savedRosterPointsQuery,
  savedRosterSummariesQuery,
} from '../../queries'
import {
  createLeagueBattle,
  createLeagueEvent,
  joinLeague,
  moderateLeagueEntry,
  revealLeague,
  submitLeagueRoster,
} from '../../../server/functions'
import { LEAGUE_MEMBER_MAX } from '../../../core/league'
import { RosterSummary } from '../rosters/RosterSummary'
import { LeaguePageActions } from './LeagueActions'

export function LeaguePage({ token, eventToken }: { token: string; eventToken?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: league } = useQuery(leagueQuery(token, eventToken))
  useEffect(() => {
    if (league === null) void navigate({ to: '/leagues' })
  }, [league, navigate])
  const [choosing, setChoosing] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null)
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['league', token] }),
      queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey }),
    ])
  }
  const selectedEventToken = league?.eventToken ?? ''
  const join = useMutation({ mutationFn: () => joinLeague({ data: { token, eventToken: selectedEventToken } }), onSuccess: refresh })
  const moderate = useMutation({
    mutationFn: (input: { userId: string; status: 'accepted' | 'rejected' }) =>
      moderateLeagueEntry({ data: { token, eventToken: selectedEventToken, ...input } }),
    onSuccess: async () => {
      setRemoving(null)
      await refresh()
    },
  })
  const submit = useMutation({
    mutationFn: (rosterId: string) => submitLeagueRoster({ data: { token, eventToken: selectedEventToken, rosterId } }),
    onSuccess: async () => {
      setChoosing(false)
      await refresh()
    },
  })
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token, eventToken: selectedEventToken } }),
    onSuccess: async () => {
      setRevealing(false)
      await refresh()
    },
  })
  const battle = useMutation({
    mutationFn: async (opponentId: string) => {
      const references = await queryClient.ensureQueryData(gameReferencesQuery())
      return createLeagueBattle({
        data: { token, eventToken: selectedEventToken, opponentId, missionPackId: references?.packs[0]?.id ?? null },
      })
    },
    onSuccess: async ({ token: battleToken }) => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token: battleToken } })
    },
  })
  const startEvent = useMutation({
    mutationFn: () => createLeagueEvent({ data: { token } }),
    onSuccess: async ({ eventToken: nextEventToken }) => {
      setStarting(false)
      await refresh()
      await navigate({ to: '/leagues/$token', params: { token }, search: { event: nextEventToken } })
    },
  })
  if (!league) return null
  const isOwner = me?.id === league.ownerId
  const ownEntry = league.entries.find((entry) => entry.userId === me?.id)
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const pendingCount = league.entries.filter((entry) => entry.status === 'pending').length
  const latestEvent = league.events[0]
  const viewingLatest = latestEvent?.token === league.eventToken
  const registrationFull =
    league.admission === 'approval' && league.playerLimit !== null
      ? accepted.length >= league.playerLimit || league.occupiedCount >= LEAGUE_MEMBER_MAX
      : league.occupiedCount >= (league.playerLimit ?? LEAGUE_MEMBER_MAX)
  const readyToReveal =
    accepted.length > 0 &&
    accepted.every((entry) => entry.submitted) &&
    (league.playerLimit === null || accepted.length === league.playerLimit)
  const problem = join.error ?? moderate.error ?? battle.error ?? startEvent.error

  return (
    <main className="w-full">
      <section className="border-b border-edge bg-panel">
        <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow text-parchment">
                {league.recurring ? `Event ${league.eventNumber} · ` : ''}
                {league.revealedAt ? 'Rosters revealed' : registrationFull ? 'Registration full' : 'Registration open'}
              </p>
              <h1 className="mt-1 text-3xl">{league.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-dim">
                <span className="chip inline-flex items-center gap-1">
                  {league.visibility === 'private' ? <LockKeyhole className="size-3" /> : <Eye className="size-3" />}
                  {league.visibility === 'private' ? 'Private link' : 'Public'}
                </span>
                <span className="chip">{league.admission === 'approval' ? 'Approval required' : 'Automatic entry'}</span>
                <span className="chip">
                  {accepted.length}
                  {league.playerLimit ? ` / ${league.playerLimit}` : ''} accepted
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isOwner ? <LeaguePageActions league={league} onDeleted={() => navigate({ to: '/leagues' })} /> : null}
              {!league.revealedAt && me && (!ownEntry || ownEntry.status === 'rejected') && !registrationFull ? (
                <Button onClick={() => join.mutate()} disabled={join.isPending}>
                  <UserPlus /> {ownEntry ? 'Request to join again' : 'Join league'}
                </Button>
              ) : null}
              {!league.revealedAt && me && (!ownEntry || ownEntry.status === 'rejected') && registrationFull ? (
                <span className="chip self-center">League full</span>
              ) : null}
              {!league.revealedAt && !me ? (
                <Button nativeButton={false} render={<Link to="/sign-in" search={{ next: `/leagues/${token}` }} />}>
                  Sign in to join
                </Button>
              ) : null}
            </div>
          </div>
          {league.description ? (
            <p className="mt-5 max-w-3xl whitespace-pre-wrap font-rules text-sm text-dim">{league.description}</p>
          ) : null}
          <Link
            to="/users/$userId"
            params={{ userId: league.ownerId }}
            className="group mt-5 flex w-fit items-center gap-2 text-sm text-dim"
          >
            <span>Organized by</span>
            <PlayerAvatar name={league.ownerName} image={league.ownerImage} className="size-7 text-xs" />
            <span className="text-bone group-hover:underline">{league.ownerName}</span>
          </Link>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-5 px-3 py-5 sm:px-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section>
          <div className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
            <h2>{league.recurring ? `Event ${league.eventNumber} entrants` : 'Entrants'}</h2>
            <span className="readout">{accepted.length}</span>
          </div>
          {league.entries.length ? (
            <div className="divide-y divide-edge border border-edge bg-panel">
              {league.entries.map((entry) => (
                <div key={entry.userId} data-person={entry.name} className="flex flex-wrap items-center gap-3 p-3">
                  <Link
                    to="/users/$userId"
                    params={{ userId: entry.userId }}
                    className="group flex min-w-0 flex-1 items-center gap-3 hover:text-info"
                  >
                    <PlayerAvatar name={entry.name} image={entry.image} className="size-9 text-xs" />
                    <span className="min-w-0">
                      <span className="block truncate font-bold uppercase group-hover:underline">{entry.name}</span>
                      <span className="block text-xs text-dim">
                        {entryStatus(entry.status, entry.submitted, Boolean(league.revealedAt))}
                      </span>
                    </span>
                  </Link>
                  {isOwner && !league.revealedAt ? (
                    <div className="flex gap-1">
                      {entry.status !== 'accepted' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Accept ${entry.name}`}
                          disabled={moderate.isPending}
                          onClick={() => moderate.mutate({ userId: entry.userId, status: 'accepted' })}
                        >
                          <Check /> Accept
                        </Button>
                      ) : null}
                      {entry.status !== 'rejected' ? (
                        <Button
                          size="sm"
                          variant={entry.status === 'accepted' ? 'outline' : 'ghost'}
                          aria-label={`${entry.status === 'accepted' ? 'Remove' : 'Reject'} ${entry.name}`}
                          disabled={moderate.isPending}
                          onClick={() => {
                            if (entry.status === 'accepted') {
                              moderate.reset()
                              setRemoving({ userId: entry.userId, name: entry.name })
                            } else {
                              moderate.mutate({ userId: entry.userId, status: 'rejected' })
                            }
                          }}
                        >
                          <X /> {entry.status === 'accepted' ? 'Remove' : null}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {league.revealedAt && entry.status === 'accepted' && entry.submitted ? (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link
                            to="/rosters/$id"
                            params={{ id: entry.userId }}
                            search={{ league: token, event: league.eventToken }}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                      >
                        <Eye /> View roster
                      </Button>
                      {ownEntry?.status === 'accepted' && entry.userId !== me?.id ? (
                        <Button size="sm" disabled={battle.isPending} onClick={() => battle.mutate(entry.userId)}>
                          <Swords /> Start battle
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-edge bg-panel px-5 py-9 text-center">
              <UserPlus className="mx-auto size-7 text-faint" />
              <p className="mt-3 font-bold uppercase">No entrants yet</p>
              <p className="mt-1 text-sm text-dim">Share this page to open registration.</p>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          {league.recurring ? (
            <section className="border border-edge bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold uppercase">Events</h2>
                <span className="readout">{league.eventCount}</span>
              </div>
              <div className="mt-3 space-y-1">
                {league.events.map((event) => (
                  <Button
                    key={event.token}
                    variant={event.token === league.eventToken ? 'outline' : 'ghost'}
                    className="w-full justify-between"
                    render={<Link to="/leagues/$token" params={{ token }} search={{ event: event.token }} />}
                  >
                    <span>Event {event.number}</span>
                    <span className="text-xs text-dim">{event.revealedAt ? 'Revealed' : 'Open'}</span>
                  </Button>
                ))}
              </div>
              {isOwner && viewingLatest && league.revealedAt ? (
                <Button className="mt-3 w-full" onClick={() => setStarting(true)}>
                  <CalendarPlus /> Start new event
                </Button>
              ) : null}
              {!viewingLatest && latestEvent ? (
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  render={<Link to="/leagues/$token" params={{ token }} search={{ event: latestEvent.token }} />}
                >
                  View current event
                </Button>
              ) : null}
            </section>
          ) : null}
          <section className="border border-edge bg-panel p-4">
            <div className="flex items-center gap-2">
              <FileLock2 className="size-5 text-parchment" />
              <h2 className="font-bold uppercase">Sealed rosters</h2>
            </div>
            <p className="mt-2 text-sm text-dim">
              A submitted roster is copied into this league. Editing or deleting the saved roster cannot change the sealed copy.
            </p>
            {ownEntry?.status === 'pending' ? (
              <p className="mt-3 text-sm text-parchment">Your request is waiting for organizer approval.</p>
            ) : null}
            {ownEntry?.status === 'rejected' ? <p className="mt-3 text-sm text-destructive">Your entry was not accepted.</p> : null}
            {ownEntry?.status === 'accepted' && !league.revealedAt ? (
              <Button className="mt-4 w-full" variant={ownEntry.submitted ? 'outline' : 'default'} onClick={() => setChoosing(true)}>
                {ownEntry.submitted ? 'Change roster' : 'Choose roster'}
              </Button>
            ) : null}
            {ownEntry?.submitted && !league.revealedAt ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-achieved">
                <ShieldCheck className="size-4" /> {ownEntry.rosterName ?? 'Roster'} submitted. You can replace it until reveal.
              </p>
            ) : null}
            {league.revealedAt ? (
              <p className="mt-3 text-sm text-achieved">Every accepted roster is now visible to anyone with this link.</p>
            ) : null}
          </section>
          {isOwner && !league.revealedAt ? (
            <section className="border border-edge bg-panel p-4">
              <h2 className="font-bold uppercase">Organizer</h2>
              <p className="mt-2 text-sm text-dim">
                Reveal closes registration and makes every accepted roster visible at once. It cannot be undone.
              </p>
              <Button className="mt-4 w-full" disabled={!readyToReveal} onClick={() => setRevealing(true)}>
                Reveal all rosters
              </Button>
              {!readyToReveal ? (
                <p className="mt-2 text-xs text-dim">
                  {accepted.length === 0
                    ? 'Accept at least one entrant first.'
                    : accepted.some((entry) => !entry.submitted)
                      ? missingRosterMessage(accepted.filter((entry) => !entry.submitted).length)
                      : league.playerLimit !== null && accepted.length < league.playerLimit
                        ? `${league.playerLimit - accepted.length} accepted place${league.playerLimit - accepted.length === 1 ? '' : 's'} still open.`
                        : 'The league is not ready to reveal.'}
                </p>
              ) : null}
            </section>
          ) : null}
          {problem ? <p className="text-sm text-destructive">{errorMessage(problem)}</p> : null}
        </aside>
      </div>

      <RosterChooser
        open={choosing}
        pending={submit.isPending}
        error={submit.error}
        onClose={() => setChoosing(false)}
        onChoose={(id) => submit.mutate(id)}
      />
      <AlertDialog open={revealing} onOpenChange={setRevealing}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Reveal every roster?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Registration closes immediately.{' '}
              {pendingCount ? `${pendingCount} pending request${pendingCount === 1 ? '' : 's'} will be rejected. ` : ''}
              Every accepted entrant’s sealed roster becomes visible, and this cannot be undone.
            </AlertDialogDescription>
            {reveal.error ? <p className="text-sm text-destructive">{errorMessage(reveal.error)}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep rosters sealed</AlertDialogCancel>
            <AlertDialogAction onClick={() => reveal.mutate()}>Reveal all rosters</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Their submitted roster will be discarded. They must join again and submit another roster to return.
            </AlertDialogDescription>
            {moderate.error ? <p className="text-sm text-destructive">{errorMessage(moderate.error)}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep entrant</AlertDialogCancel>
            <AlertDialogAction
              disabled={moderate.isPending}
              onClick={() => removing && moderate.mutate({ userId: removing.userId, status: 'rejected' })}
            >
              Remove entrant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={starting} onOpenChange={setStarting}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Start event {league.eventNumber + 1}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Registration will open with no entrants. Players from earlier events can join again and submit new sealed rosters.
            </AlertDialogDescription>
            {startEvent.error ? <p className="text-sm text-destructive">{errorMessage(startEvent.error)}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current event</AlertDialogCancel>
            <AlertDialogAction disabled={startEvent.isPending} onClick={() => startEvent.mutate()}>
              Start new event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function RosterChooser({
  open,
  pending,
  error,
  onClose,
  onChoose,
}: {
  open: boolean
  pending: boolean
  error: Error | null
  onClose: () => void
  onChoose: (id: string) => void
}) {
  const rosterQuery = useQuery({ ...savedRosterSummariesQuery(), enabled: open })
  const { data: available } = useQuery({ ...factionIndexQuery(), enabled: open })
  const { data: prices } = useQuery({ ...savedRosterPointsQuery(), enabled: open })
  const rosters = rosterQuery.data ?? []
  const points = new Map((prices ?? []).map((entry) => [entry.id, entry.points]))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Seal a roster</DialogTitle>
          <DialogDescription className="text-dim">
            This copies the roster into the league. You can submit another copy until the organizer reveals every list.
          </DialogDescription>
        </DialogHeader>
        {error || rosterQuery.error ? <p className="text-sm text-destructive">{errorMessage(error ?? rosterQuery.error)}</p> : null}
        {rosterQuery.isPending ? (
          <div className="border border-dashed border-edge p-5 text-center">
            <p className="text-sm text-dim">Loading rosters…</p>
          </div>
        ) : rosters.length ? (
          <div className="space-y-2">
            {rosters.map((roster) => (
              <button
                key={roster.id}
                type="button"
                data-roster={roster.name}
                className="flex w-full flex-wrap items-center gap-2 border border-edge bg-panel p-2 hover:border-azure disabled:cursor-wait disabled:opacity-70"
                disabled={pending}
                onClick={() => onChoose(roster.id)}
              >
                <RosterSummary
                  roster={roster}
                  faction={available?.factions.find((entry) => entry.id === roster.catalogueId)}
                  points={points.get(roster.id)}
                />
                <FileLock2 className="ml-1 size-4 shrink-0 text-parchment" />
              </button>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-edge p-5 text-center">
            <p className="text-sm text-dim">Build or import a roster before submitting.</p>
            <Button className="mt-3" nativeButton={false} render={<Link to="/rosters" />}>
              Go to rosters
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function entryStatus(status: 'pending' | 'accepted' | 'rejected', submitted: boolean, revealed: boolean) {
  if (status === 'pending') return 'Waiting for approval'
  if (status === 'rejected') return 'Not accepted'
  if (revealed) return submitted ? 'Roster revealed' : 'No roster submitted'
  return submitted ? 'Roster sealed' : 'Accepted · roster pending'
}

function missingRosterMessage(count: number) {
  return `${count} accepted roster${count === 1 ? '' : 's'} still missing.`
}
