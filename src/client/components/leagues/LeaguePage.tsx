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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PlayerAvatar } from '../PlayerAvatar'
import { SearchableSelect } from '../SearchableSelect'
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
  assignLeagueRosterRequirement,
  createLeagueBattle,
  createLeagueEvent,
  joinLeague,
  moderateLeagueEntry,
  revealLeague,
  submitLeagueRoster,
} from '../../../server/functions'
import { alliedLeagueRosterLimit, LEAGUE_MEMBER_MAX } from '../../../core/league'
import { RosterSummary } from '../rosters/RosterSummary'
import { LeaguePageActions } from './LeagueActions'
import { LeagueEventRuleFields, type LeagueEventRuleValue } from './LeagueEventRuleFields'

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
  const [eventRule, setEventRule] = useState<LeagueEventRuleValue>({ format: '1v1', rosterLimit: 2_000 })
  const [choosingBattle, setChoosingBattle] = useState(false)
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null)
  const [reassigning, setReassigning] = useState<{ userId: string; name: string; requiredLimit: number } | null>(null)
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
  const assign = useMutation({
    mutationFn: (input: { userId: string; requiredLimit: number }) =>
      assignLeagueRosterRequirement({ data: { token, eventToken: selectedEventToken, ...input } }),
    onSuccess: refresh,
  })
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token, eventToken: selectedEventToken } }),
    onSuccess: async () => {
      setRevealing(false)
      await refresh()
    },
  })
  const battle = useMutation({
    mutationFn: async (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) => {
      const references = await queryClient.ensureQueryData(gameReferencesQuery())
      return createLeagueBattle({
        data: { token, eventToken: selectedEventToken, ...players, missionPackId: references?.packs[0]?.id ?? null },
      })
    },
    onSuccess: async ({ token: battleToken }) => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token: battleToken } })
    },
  })
  const startEvent = useMutation({
    mutationFn: () => createLeagueEvent({ data: { token, ...eventRule } }),
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
    (league.format !== '2v1' ||
      (accepted.every((entry) => entry.requiredLimit !== null) &&
        accepted.some((entry) => entry.requiredLimit === league.rosterLimit) &&
        accepted.filter((entry) => entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit ?? 0)).length >= 2)) &&
    (league.playerLimit === null || accepted.length === league.playerLimit)
  const eventRuleBlocked = eventRule.format === '2v1' && league.playerLimit !== null && league.playerLimit < 3
  const problem = join.error ?? moderate.error ?? (league?.format === '2v1' ? null : battle.error)
  const requestAssignment = (entry: (typeof accepted)[number], requiredLimit: number) => {
    if (entry.requiredLimit === requiredLimit) return
    if (entry.submitted) setReassigning({ userId: entry.userId, name: entry.name, requiredLimit })
    else assign.mutate({ userId: entry.userId, requiredLimit })
  }

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
                {league.format && league.rosterLimit ? (
                  <span className="chip">
                    {league.format === '2v1'
                      ? `${league.rosterLimit.toLocaleString()} solo / ${alliedLeagueRosterLimit(league.rosterLimit).toLocaleString()} allied`
                      : `1v1 · ${league.rosterLimit.toLocaleString()} points`}
                  </span>
                ) : null}
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
                      {entry.status === 'accepted' && entry.requiredLimit !== null ? (
                        <span className="mt-1 block text-xs text-parchment">
                          {entry.requiredLimit.toLocaleString()}-point roster
                          {league.format === '2v1' ? (entry.requiredLimit === league.rosterLimit ? ' · solo' : ' · allied') : ''}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  {isOwner && !league.revealedAt ? (
                    <div className="flex w-full justify-end gap-1 sm:w-auto">
                      {league.format === '2v1' && entry.status === 'accepted' && league.rosterLimit ? (
                        <>
                          <Button
                            size="sm"
                            variant={entry.requiredLimit === league.rosterLimit ? 'default' : 'outline'}
                            aria-label={`Assign ${entry.name} a solo roster`}
                            aria-pressed={entry.requiredLimit === league.rosterLimit}
                            disabled={assign.isPending}
                            onClick={() => requestAssignment(entry, league.rosterLimit!)}
                          >
                            Solo
                          </Button>
                          <Button
                            size="sm"
                            variant={entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit) ? 'default' : 'outline'}
                            aria-label={`Assign ${entry.name} an allied roster`}
                            aria-pressed={entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit)}
                            disabled={assign.isPending}
                            onClick={() => requestAssignment(entry, alliedLeagueRosterLimit(league.rosterLimit!))}
                          >
                            Allied
                          </Button>
                        </>
                      ) : null}
                      {assign.error && assign.variables?.userId === entry.userId && reassigning === null ? (
                        <p role="alert" className="w-full text-right text-xs text-destructive">
                          {errorMessage(assign.error)}
                        </p>
                      ) : null}
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
                      {ownEntry?.status === 'accepted' && entry.userId !== me?.id && league.format !== '2v1' ? (
                        <Button size="sm" disabled={battle.isPending} onClick={() => battle.mutate({ opponentId: entry.userId })}>
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
              <Button
                className="mt-4 w-full"
                variant={ownEntry.submitted ? 'outline' : 'default'}
                disabled={league.format === '2v1' && ownEntry.requiredLimit === null}
                onClick={() => setChoosing(true)}
              >
                {ownEntry.submitted ? 'Change roster' : 'Choose roster'}
              </Button>
            ) : null}
            {league.format === '2v1' && ownEntry?.status === 'accepted' && ownEntry.requiredLimit === null && !league.revealedAt ? (
              <p className="mt-3 text-sm text-parchment">Wait for the organizer to assign your solo or allied roster size.</p>
            ) : null}
            {ownEntry?.submitted && !league.revealedAt ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-achieved">
                <ShieldCheck className="size-4" /> {ownEntry.rosterName ?? 'Roster'} submitted. You can replace it until reveal.
              </p>
            ) : null}
            {league.revealedAt ? (
              <p className="mt-3 text-sm text-achieved">Every accepted roster is now visible to anyone with this link.</p>
            ) : null}
            {league.revealedAt && league.format === '2v1' && ownEntry?.status === 'accepted' ? (
              <Button className="mt-4 w-full" disabled={battle.isPending} onClick={() => setChoosingBattle(true)}>
                <Swords /> Start 2v1 battle
              </Button>
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
                    : league.format === '2v1' && accepted.some((entry) => entry.requiredLimit === null)
                      ? 'Assign every accepted entrant a solo or allied roster size.'
                      : league.format === '2v1' && !accepted.some((entry) => entry.requiredLimit === league.rosterLimit)
                        ? 'Assign at least one solo entrant.'
                        : league.format === '2v1' &&
                            accepted.filter((entry) => entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit ?? 0)).length < 2
                          ? 'Assign at least two allied entrants.'
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
        requiredLimit={ownEntry?.requiredLimit ?? null}
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
      <AlertDialog open={reassigning !== null} onOpenChange={(open) => !assign.isPending && !open && setReassigning(null)}>
        <AlertDialogContent aria-busy={assign.isPending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Change {reassigning?.name}’s roster size?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Their sealed roster will be discarded. They must seal a roster for the new size before reveal.
            </AlertDialogDescription>
            {assign.isPending ? <output className="sr-only">Changing roster size…</output> : null}
            {assign.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(assign.error)}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assign.isPending}>Keep current size</AlertDialogCancel>
            <AlertDialogAction
              disabled={assign.isPending}
              onClick={() => {
                if (!reassigning) return
                assign.mutate(
                  { userId: reassigning.userId, requiredLimit: reassigning.requiredLimit },
                  { onSuccess: () => setReassigning(null) },
                )
              }}
            >
              {assign.isPending ? 'Changing…' : 'Change size'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={starting} onOpenChange={(open) => !startEvent.isPending && setStarting(open)}>
        <AlertDialogContent aria-busy={startEvent.isPending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Start event {league.eventNumber + 1}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Registration will open with no entrants. Players from earlier events can join again and submit new sealed rosters.
            </AlertDialogDescription>
            <LeagueEventRuleFields value={eventRule} disabled={startEvent.isPending} onChange={setEventRule} />
            {eventRuleBlocked ? (
              <p className="text-sm text-parchment">Raise the league player limit to at least 3 in Edit league first.</p>
            ) : null}
            {startEvent.error ? <p className="text-sm text-destructive">{errorMessage(startEvent.error)}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={startEvent.isPending}>Keep current event</AlertDialogCancel>
            <AlertDialogAction disabled={startEvent.isPending || eventRuleBlocked} onClick={() => startEvent.mutate()}>
              {startEvent.isPending ? 'Starting…' : 'Start new event'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {league.format === '2v1' && ownEntry?.status === 'accepted' && league.rosterLimit ? (
        <LeagueBattleChooser
          key={league.eventToken}
          open={choosingBattle}
          ownUserId={ownEntry.userId}
          ownRequiredLimit={ownEntry.requiredLimit}
          rosterLimit={league.rosterLimit}
          entries={accepted}
          pending={battle.isPending}
          error={battle.error}
          onClose={() => setChoosingBattle(false)}
          onStart={(players) => battle.mutate(players, { onSuccess: () => setChoosingBattle(false) })}
        />
      ) : null}
    </main>
  )
}

function RosterChooser({
  open,
  pending,
  error,
  requiredLimit,
  onClose,
  onChoose,
}: {
  open: boolean
  pending: boolean
  error: Error | null
  requiredLimit: number | null
  onClose: () => void
  onChoose: (id: string) => void
}) {
  const rosterQuery = useQuery({ ...savedRosterSummariesQuery(), enabled: open })
  const { data: available } = useQuery({ ...factionIndexQuery(), enabled: open })
  const { data: prices } = useQuery({ ...savedRosterPointsQuery(), enabled: open })
  const rosters = (rosterQuery.data ?? []).filter((roster) => requiredLimit === null || roster.limit === requiredLimit)
  const points = new Map((prices ?? []).map((entry) => [entry.id, entry.points]))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Seal a roster</DialogTitle>
          <DialogDescription className="text-dim">
            {requiredLimit === null
              ? 'This copies the roster into the league. You can replace it until the organizer reveals every list.'
              : `Choose a roster configured for ${requiredLimit.toLocaleString()} points. You can replace it until the organizer reveals every list.`}
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
            <p className="text-sm text-dim">
              {requiredLimit === null
                ? 'Build or import a roster before submitting.'
                : `Build or import a ${requiredLimit.toLocaleString()}-point roster before submitting.`}
            </p>
            <Button
              className="mt-3"
              nativeButton={false}
              render={<Link to="/rosters" search={requiredLimit === null ? {} : { limit: requiredLimit }} />}
            >
              Go to rosters
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function LeagueBattleChooser({
  open,
  ownUserId,
  ownRequiredLimit,
  rosterLimit,
  entries,
  pending,
  error,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  ownRequiredLimit: number | null
  rosterLimit: number
  entries: { userId: string; name: string; image: string | null; requiredLimit: number | null }[]
  pending: boolean
  error: Error | null
  onClose: () => void
  onStart: (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) => void
}) {
  const [soloId, setSoloId] = useState<string | null>(null)
  const [alliedIds, setAlliedIds] = useState<[string | null, string | null]>([null, null])
  useEffect(() => {
    if (!open) {
      setSoloId(null)
      setAlliedIds([null, null])
    }
  }, [open])
  const alliedLimit = alliedLeagueRosterLimit(rosterLimit)
  const isSolo = ownRequiredLimit === rosterLimit
  const soloEntries = entries.filter((entry) => entry.userId !== ownUserId && entry.requiredLimit === rosterLimit)
  const alliedEntries = entries.filter((entry) => entry.userId !== ownUserId && entry.requiredLimit === alliedLimit)
  const ready = isSolo ? alliedIds.every((id) => id !== null) : soloId !== null && alliedIds[0] !== null
  const duplicateNames = new Set(
    entries.filter((entry, index) => entries.findIndex((candidate) => candidate.name === entry.name) !== index).map((entry) => entry.name),
  )
  const groups = (candidates: typeof entries, excluded: (string | null)[] = []) => [
    {
      label: '',
      items: candidates
        .filter((entry) => !excluded.includes(entry.userId))
        .map((entry) => ({
          label: duplicateNames.has(entry.name) ? `${entry.name} · ${entry.userId.slice(0, 8)}` : entry.name,
          value: entry.userId,
          icon: <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-[0.65rem]" />,
        })),
    },
  ]
  const setAllied = (index: number, userId: string) => {
    setAlliedIds((current) => {
      const next: [string | null, string | null] = [...current]
      next[index] = userId
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent
        aria-busy={pending}
        className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Start 2v1 battle</DialogTitle>
          <DialogDescription className="text-dim">
            {isSolo ? 'Choose two allied entrants to face.' : 'Choose your allied teammate and the solo entrant to face.'}
          </DialogDescription>
        </DialogHeader>
        {!isSolo ? (
          <div className="space-y-1.5">
            <Label htmlFor="league-battle-solo">Solo opponent</Label>
            <SearchableSelect
              id="league-battle-solo"
              groups={groups(soloEntries)}
              value={soloId ?? ''}
              onValueChange={setSoloId}
              placeholder="Choose the solo opponent"
              searchPlaceholder="Search entrants…"
              className="h-11 rounded-none border-edge bg-sunken"
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="league-battle-allied-1">{isSolo ? 'First allied opponent' : 'Allied teammate'}</Label>
          <SearchableSelect
            id="league-battle-allied-1"
            groups={groups(alliedEntries, alliedIds[1] ? [alliedIds[1]] : [])}
            value={alliedIds[0] ?? ''}
            onValueChange={(id) => setAllied(0, id)}
            placeholder={isSolo ? 'Choose the first allied opponent' : 'Choose your allied teammate'}
            searchPlaceholder="Search entrants…"
            className="h-11 rounded-none border-edge bg-sunken"
          />
        </div>
        {isSolo ? (
          <div className="space-y-1.5">
            <Label htmlFor="league-battle-allied-2">Second allied opponent</Label>
            <SearchableSelect
              id="league-battle-allied-2"
              groups={groups(alliedEntries, alliedIds[0] ? [alliedIds[0]] : [])}
              value={alliedIds[1] ?? ''}
              onValueChange={(id) => setAllied(1, id)}
              placeholder="Choose the second allied opponent"
              searchPlaceholder="Search entrants…"
              className="h-11 rounded-none border-edge bg-sunken"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        {pending ? <output className="sr-only">Starting battle…</output> : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready || pending}
            onClick={() => {
              if (isSolo && alliedIds[0] && alliedIds[1]) {
                onStart({ opponentId: alliedIds[0], secondOpponentId: alliedIds[1] })
              } else if (soloId && alliedIds[0]) {
                onStart({ opponentId: soloId, allyId: alliedIds[0] })
              }
            }}
          >
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
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
