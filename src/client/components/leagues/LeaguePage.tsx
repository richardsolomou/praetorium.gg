import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { PlayerAvatar } from '../PlayerAvatar'
import { SearchableSelect } from '../SearchableSelect'
import { errorMessage } from '../../queryClient'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import {
  battlesQuery,
  factionIndexQuery,
  gameReferencesQuery,
  leagueBattlesFrom,
  leagueBattlesQuery,
  leagueQuery,
  leaguesQuery,
  meQuery,
  savedRosterPointsQuery,
  savedRosterSummariesQuery,
} from '../../queries'
import {
  assignLeagueRosterRequirement,
  assignLeagueTeam,
  createLeagueBattle,
  createLeagueEvent,
  joinLeague,
  makeLeagueRecurring,
  moderateLeagueEntry,
  revealLeague,
  submitLeagueRoster,
} from '../../../server/functions'
import { GAME_SIZES } from '../../../core/battle'
import { alliedLeagueRosterLimit, leagueRosterSplit, leagueTableShape, LEAGUE_MEMBER_MAX } from '../../../core/league'
import { TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { seatedPlayers, seatsFor, type Seat } from '../../seats'
import { SeatMatchup, SeatRows, seatLabel, seatOption } from '../Seats'
import { rosterWaivers, waiverCount, waiverLabels } from '../FormatWaivers'
import { RosterSummary } from '../rosters/RosterSummary'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { BattleShelf } from '../battles/BattleShelf'
import { LeaguePageActions } from './LeagueActions'
import { LeagueEventRuleFields, type LeagueEventRuleValue } from './LeagueEventRuleFields'

export function LeaguePage({ token, eventToken, startBattle }: { token: string; eventToken?: string; startBattle?: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: league } = useQuery(leagueQuery(token, eventToken))
  const battleHistory = useInfiniteQuery({
    ...leagueBattlesQuery(token, league?.eventToken ?? ''),
    enabled: Boolean(league?.revealedAt && league.eventToken),
  })
  useEffect(() => {
    if (league === null) void navigate({ to: '/leagues' })
  }, [league, navigate])
  const [choosing, setChoosing] = useState(false)
  const [sealing, setSealing] = useState<SavedRoster | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [eventRule, setEventRule] = useState<LeagueEventRuleValue>({ format: '1v1', rosterLimit: 2_000 })
  const [choosingBattle, setChoosingBattle] = useState(Boolean(startBattle))
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null)
  const [reassigning, setReassigning] = useState<{ userId: string; name: string; requiredLimit: number } | null>(null)
  const [pairing, setPairing] = useState<{ userId: string; name: string } | null>(null)
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
  const assignTeam = useMutation({
    mutationFn: (userIds: string[]) => assignLeagueTeam({ data: { token, eventToken: selectedEventToken, userIds } }),
    onSuccess: async () => {
      setPairing(null)
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
    mutationFn: async () => {
      await makeLeagueRecurring({ data: { token } })
      return createLeagueEvent({ data: { token, ...eventRule } })
    },
    onSuccess: async ({ eventToken: nextEventToken }) => {
      setStarting(false)
      await refresh()
      await navigate({ to: '/leagues/$token', params: { token }, search: { event: nextEventToken } })
    },
  })
  const openBattleChooser = () => {
    battle.reset()
    setChoosingBattle(true)
  }
  const closeBattleChooser = () => {
    battle.reset()
    setChoosingBattle(false)
  }
  const openTeamChooser = (next: { userId: string; name: string }) => {
    assignTeam.reset()
    setPairing(next)
  }
  const closeTeamChooser = () => {
    assignTeam.reset()
    setPairing(null)
  }
  const openRosterChooser = () => {
    submit.reset()
    setChoosing(true)
  }
  const closeRosterChooser = () => {
    if (submit.isPending) return
    submit.reset()
    setChoosing(false)
  }
  /** A roster that is not playing all of its format, held back until its owner says so on purpose. */
  const sealWaivers = sealing ? rosterWaivers(sealing) : []
  if (!league) return null
  const eventBattles = leagueBattlesFrom(battleHistory.data)
  const isOwner = me?.id === league.ownerId
  const ownEntry = league.entries.find((entry) => entry.userId === me?.id)
  const battleFormat = leagueTableShape(league.format)
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const oneOnOneEntrants =
    league.format === null
      ? accepted.filter(
          (entry) =>
            typeof ownEntry?.sealedLimit === 'number' &&
            GAME_SIZES.some((size) => size.limit === ownEntry.sealedLimit) &&
            entry.sealedLimit === ownEntry.sealedLimit,
        )
      : accepted
  const pendingCount = league.entries.filter((entry) => entry.status === 'pending').length
  const latestEvent = league.events[0]
  const archivedEvents = league.events.slice(1)
  const viewingLatest = latestEvent?.token === league.eventToken
  const entrantLabels = disambiguatedPlayerLabels(league.entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const teamProjection = projectDoublesTeams(accepted)
  const { members: teamMembers } = teamProjection
  const removingEntry = removing ? accepted.find((entry) => entry.userId === removing.userId) : undefined
  const removingTeammate = removingEntry?.teamId
    ? teamMembers.get(removingEntry.teamId)?.find((entry) => entry.userId !== removingEntry.userId)
    : undefined
  const doublesReady =
    accepted.length >= 4 &&
    accepted.length % 2 === 0 &&
    accepted.every((entry) => entry.teamId && teamMembers.get(entry.teamId)?.length === 2)
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
    (league.format !== '2v2' || (doublesReady && pendingCount === 0)) &&
    (league.playerLimit === null || accepted.length === league.playerLimit)
  const eventRuleBlocked =
    league.playerLimit !== null &&
    ((eventRule.format === '2v1' && league.playerLimit < 3) ||
      (eventRule.format === '2v2' && (league.playerLimit < 4 || league.playerLimit % 2 !== 0)))
  const problem = join.error ?? moderate.error ?? (league?.format === '2v1' || league?.format === '2v2' ? null : battle.error)
  const requestAssignment = (entry: (typeof accepted)[number], requiredLimit: number) => {
    if (entry.requiredLimit === requiredLimit) return
    if (entry.submitted) {
      setReassigning({ userId: entry.userId, name: entrantLabels.get(entry.userId) ?? entry.name, requiredLimit })
    } else assign.mutate({ userId: entry.userId, requiredLimit })
  }

  return (
    <main className="w-full">
      <section className="border-b border-edge bg-panel">
        <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow text-parchment">
                {viewingLatest ? 'Current event' : `Archived event ${league.eventNumber}`} ·{' '}
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
                    {TABLE_SHAPE_LABELS[league.format].name} ·{' '}
                    {leagueRosterSplit(league.format, league.rosterLimit) ?? `${league.rosterLimit.toLocaleString()} points`}
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
        <section className="min-w-0">
          <div className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
            <h2>{viewingLatest ? 'Entrants' : `Event ${league.eventNumber} entrants`}</h2>
            <span className="readout">{accepted.length}</span>
          </div>
          {league.entries.length ? (
            <div className="divide-y divide-edge border border-edge bg-panel">
              {league.entries.map((entry) => {
                const entrantLabel = entrantLabels.get(entry.userId) ?? entry.name
                return (
                  <div key={entry.userId} data-person={entry.name} className="flex min-w-0 flex-wrap items-center gap-3 p-3">
                    <Link
                      to="/users/$userId"
                      params={{ userId: entry.userId }}
                      className="group flex min-w-0 flex-1 items-center gap-3 hover:text-info"
                    >
                      <PlayerAvatar name={entry.name} image={entry.image} className="size-9 text-xs" />
                      <span className="min-w-0">
                        <span className="block truncate font-bold uppercase group-hover:underline">{entrantLabel}</span>
                        <span className="block text-xs text-dim">
                          {entryStatus(entry.status, entry.submitted, Boolean(league.revealedAt))}
                        </span>
                        {entry.status === 'accepted' && entry.requiredLimit !== null ? (
                          <span className="mt-1 block text-xs text-parchment">
                            {entry.requiredLimit.toLocaleString()}-point roster
                            {league.format === '2v1' ? (entry.requiredLimit === league.rosterLimit ? ' · solo' : ' · allied') : ''}
                            {league.format === '2v2' && entry.teamId
                              ? ` · paired with ${
                                  entrantLabels.get(
                                    teamMembers.get(entry.teamId)?.find((member) => member.userId !== entry.userId)?.userId ?? '',
                                  ) ?? 'teammate'
                                }`
                              : ''}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                    {isOwner && !league.revealedAt ? (
                      <div className="flex w-full min-w-0 flex-wrap justify-end gap-1 sm:w-auto">
                        {league.format === '2v1' && entry.status === 'accepted' && league.rosterLimit ? (
                          <>
                            <Button
                              size="sm"
                              variant={entry.requiredLimit === league.rosterLimit ? 'default' : 'outline'}
                              aria-label={`Assign ${entrantLabel} a solo roster`}
                              aria-pressed={entry.requiredLimit === league.rosterLimit}
                              disabled={assign.isPending}
                              onClick={() => requestAssignment(entry, league.rosterLimit!)}
                            >
                              Solo
                            </Button>
                            <Button
                              size="sm"
                              variant={entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit) ? 'default' : 'outline'}
                              aria-label={`Assign ${entrantLabel} an allied roster`}
                              aria-pressed={entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit)}
                              disabled={assign.isPending}
                              onClick={() => requestAssignment(entry, alliedLeagueRosterLimit(league.rosterLimit!))}
                            >
                              Allied
                            </Button>
                          </>
                        ) : null}
                        {league.format === '2v2' && entry.status === 'accepted' ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={assignTeam.isPending}
                              aria-label={`${entry.teamId ? 'Re-pair' : 'Pair'} ${entrantLabel}`}
                              onClick={() => openTeamChooser({ userId: entry.userId, name: entrantLabel })}
                            >
                              {entry.teamId ? 'Re-pair' : 'Pair'}
                            </Button>
                            {entry.teamId ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={assignTeam.isPending}
                                aria-label={`Unpair ${entrantLabel}`}
                                onClick={() => openTeamChooser({ userId: entry.userId, name: entrantLabel })}
                              >
                                Unpair
                              </Button>
                            ) : null}
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
                            aria-label={`Accept ${entrantLabel}`}
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
                            aria-label={`${entry.status === 'accepted' ? 'Remove' : 'Reject'} ${entrantLabel}`}
                            disabled={moderate.isPending}
                            onClick={() => {
                              if (entry.status === 'accepted') {
                                moderate.reset()
                                setRemoving({ userId: entry.userId, name: entrantLabel })
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
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="border border-dashed border-edge bg-panel px-5 py-9 text-center">
              <UserPlus className="mx-auto size-7 text-faint" />
              <p className="mt-3 font-bold uppercase">No entrants yet</p>
              <p className="mt-1 text-sm text-dim">Share this page to open registration.</p>
            </div>
          )}

          {league.revealedAt ? (
            <div className="mt-5">
              {eventBattles.length ? (
                <>
                  <BattleShelf title="Battles" battles={eventBattles} />
                  {battleHistory.hasNextPage ? (
                    <Button
                      className="mt-3 w-full"
                      variant="outline"
                      disabled={battleHistory.isFetchingNextPage}
                      onClick={() => battleHistory.fetchNextPage()}
                    >
                      {battleHistory.isFetchingNextPage ? 'Loading…' : 'Show more battles'}
                    </Button>
                  ) : null}
                </>
              ) : battleHistory.isPending ? (
                <LeagueBattleSkeleton />
              ) : (
                <div className="border border-dashed border-edge bg-panel px-5 py-7 text-center">
                  <Swords className="mx-auto size-7 text-faint" />
                  <p className="mt-3 font-bold uppercase">No battles yet</p>
                  <p className="mt-1 text-sm text-dim">Battles started from this event will appear here for live viewing and review.</p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        <aside className="space-y-3">
          <section className="border border-edge bg-panel p-4">
            <div className="flex items-center gap-2">
              <FileLock2 className="size-5 text-parchment" />
              <h2 className="font-bold uppercase">Sealed rosters</h2>
            </div>
            <p className="mt-2 text-sm text-dim">
              A submitted roster is copied into this league. Editing or deleting the saved roster cannot change the sealed copy.
            </p>
            <p className="mt-3 text-sm text-dim">
              Praetorium checks the event format, assigned size, points, and every roster construction rule it can verify before sealing it.
            </p>
            {league.format === '2v2' ? (
              <p className="mt-3 text-sm text-parchment">
                Each team must select exactly one eligible CHARACTER or EPIC HERO as its Warlord. Praetorium checks both rosters when the
                team seals them and rechecks at reveal; your team and organizer must manually check the remaining official cross-army
                uniqueness restrictions.
              </p>
            ) : null}
            {ownEntry?.status === 'pending' ? (
              <p className="mt-3 text-sm text-parchment">Your request is waiting for organizer approval.</p>
            ) : null}
            {ownEntry?.status === 'rejected' ? <p className="mt-3 text-sm text-destructive">Your entry was not accepted.</p> : null}
            {ownEntry?.status === 'accepted' && !league.revealedAt ? (
              <Button
                className="mt-4 w-full"
                variant={ownEntry.submitted ? 'outline' : 'default'}
                disabled={(league.format === '2v1' || league.format === '2v2') && ownEntry.requiredLimit === null}
                onClick={openRosterChooser}
              >
                {ownEntry.submitted ? 'Change roster' : 'Choose roster'}
              </Button>
            ) : null}
            {league.format === '2v1' && ownEntry?.status === 'accepted' && ownEntry.requiredLimit === null && !league.revealedAt ? (
              <p className="mt-3 text-sm text-parchment">Wait for the organizer to assign your solo or allied roster size.</p>
            ) : null}
            {league.format === '2v2' && ownEntry?.status === 'accepted' && ownEntry.requiredLimit === null && !league.revealedAt ? (
              <p className="mt-3 text-sm text-parchment">Wait for the organizer to pair you with a teammate before sealing a roster.</p>
            ) : null}
            {ownEntry?.submitted && !league.revealedAt ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-achieved">
                <ShieldCheck className="size-4" /> {ownEntry.rosterName ?? 'Roster'} submitted. You can replace it until reveal.
              </p>
            ) : null}
            {league.revealedAt ? (
              <p className="mt-3 text-sm text-achieved">Every accepted roster is now visible to anyone with this link.</p>
            ) : null}
            {league.revealedAt && ownEntry?.status === 'accepted' ? (
              <Button className="mt-4 w-full" disabled={battle.isPending} onClick={openBattleChooser}>
                <Swords /> {startBattleLabel(battleFormat)}
              </Button>
            ) : null}
          </section>
          {isOwner && !league.revealedAt ? (
            <section className="border border-edge bg-panel p-4">
              <h2 className="font-bold uppercase">Organizer</h2>
              <p className="mt-2 text-sm text-dim">
                Reveal closes registration and makes every accepted roster visible at once. It cannot be undone.
              </p>
              <Button
                className="mt-4 w-full"
                disabled={!readyToReveal}
                onClick={() => {
                  reveal.reset()
                  setRevealing(true)
                }}
              >
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
                          : league.format === '2v2' && pendingCount > 0
                            ? 'Resolve every pending request before reveal.'
                            : league.format === '2v2' && accepted.length < 4
                              ? 'Accept at least four entrants for doubles.'
                              : league.format === '2v2' && accepted.length % 2 !== 0
                                ? 'Doubles needs an even number of accepted entrants.'
                                : league.format === '2v2' && !doublesReady
                                  ? 'Pair every accepted entrant into a team of exactly two.'
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
          <section className="border border-edge bg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold uppercase">League events</h2>
              <span className="readout">{league.eventCount}</span>
            </div>
            {latestEvent ? (
              <div className="mt-3">
                <p className="eyebrow mb-1 text-dim">Current</p>
                <Link
                  to="/leagues/$token"
                  params={{ token }}
                  search={{ event: latestEvent.token }}
                  className={buttonVariants({
                    variant: latestEvent.token === league.eventToken ? 'outline' : 'ghost',
                    className: 'w-full justify-between',
                  })}
                >
                  <span>Current event</span>
                  <span className="text-xs text-dim">{latestEvent.revealedAt ? 'Revealed' : 'Active'}</span>
                </Link>
              </div>
            ) : null}
            {isOwner && viewingLatest && league.revealedAt ? (
              <Button className="mt-3 w-full" onClick={() => setStarting(true)}>
                <CalendarPlus /> Create new event
              </Button>
            ) : null}
            {archivedEvents.length ? (
              <div className="mt-4">
                <p className="eyebrow mb-1 text-dim">Archive</p>
                <div className="space-y-1">
                  {archivedEvents.map((event) => (
                    <Link
                      key={event.token}
                      to="/leagues/$token"
                      params={{ token }}
                      search={{ event: event.token }}
                      className={buttonVariants({
                        variant: event.token === league.eventToken ? 'outline' : 'ghost',
                        className: 'w-full justify-between',
                      })}
                    >
                      <span>Event {event.number}</span>
                      <span className="text-xs text-dim">Revealed</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <RosterChooser
        open={choosing}
        pending={submit.isPending}
        error={submit.error}
        requiredLimit={ownEntry?.requiredLimit ?? null}
        onClose={closeRosterChooser}
        onChoose={(roster) => {
          submit.reset()
          if (rosterWaivers(roster).length) setSealing(roster)
          else submit.mutate(roster.id)
        }}
      />
      <AlertDialog
        open={sealing !== null}
        onOpenChange={(open) => {
          if (submit.isPending) return
          if (!open) setSealing(null)
        }}
      >
        <AlertDialogContent aria-busy={submit.isPending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Seal a roster built past its format?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              {sealing?.name} is built with {waiverCount(sealWaivers)} switched off: {waiverLabels(sealWaivers)}. Praetorium has not checked{' '}
              {sealWaivers.length === 1 ? 'that restriction' : 'those restrictions'}, so this roster may not be legal for the event. Once
              the organizer reveals the rosters, they and every opponent will see what it waives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submit.isPending}>Choose another roster</AlertDialogCancel>
            <AlertDialogAction
              disabled={submit.isPending}
              onClick={() => {
                if (sealing) submit.mutate(sealing.id)
                setSealing(null)
              }}
            >
              Seal this roster
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={revealing}
        onOpenChange={(open) => {
          if (reveal.isPending) return
          if (!open) reveal.reset()
          setRevealing(open)
        }}
      >
        <AlertDialogContent aria-busy={reveal.isPending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Reveal every roster?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Registration closes immediately.{' '}
              {pendingCount ? `${pendingCount} pending request${pendingCount === 1 ? '' : 's'} will be rejected. ` : ''}
              Every accepted entrant’s sealed roster becomes visible, and this cannot be undone.
            </AlertDialogDescription>
            {reveal.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(reveal.error)}
              </p>
            ) : null}
            {reveal.isPending ? <output className="sr-only">Revealing rosters…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reveal.isPending}>Keep rosters sealed</AlertDialogCancel>
            <AlertDialogAction disabled={reveal.isPending} onClick={() => reveal.mutate()}>
              {reveal.isPending ? 'Revealing…' : 'Reveal all rosters'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (moderate.isPending) return
          if (!open) {
            moderate.reset()
            setRemoving(null)
          }
        }}
      >
        <AlertDialogContent aria-busy={moderate.isPending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              {removingTeammate
                ? `This also unpairs ${entrantLabels.get(removingTeammate.userId) ?? removingTeammate.name}. Both teammates’ sealed rosters will be cleared. ${removing?.name} must join again and submit another roster to return.`
                : 'Their submitted roster will be discarded. They must join again and submit another roster to return.'}
            </AlertDialogDescription>
            {moderate.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(moderate.error)}
              </p>
            ) : null}
            {moderate.isPending ? <output className="sr-only">Removing entrant…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moderate.isPending}>Keep entrant</AlertDialogCancel>
            <AlertDialogAction
              disabled={moderate.isPending}
              onClick={() => removing && moderate.mutate({ userId: removing.userId, status: 'rejected' })}
            >
              {moderate.isPending ? 'Removing…' : 'Remove entrant'}
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
            <AlertDialogTitle className="uppercase">Create a new event?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Registration will open with no entrants. Players from earlier events can join again and submit new sealed rosters.
            </AlertDialogDescription>
            <LeagueEventRuleFields value={eventRule} disabled={startEvent.isPending} onChange={setEventRule} />
            {eventRuleBlocked ? (
              <p className="text-sm text-parchment">
                {eventRule.format === '2v2'
                  ? 'Set the league player limit to an even number of at least 4 in Edit league first.'
                  : 'Raise the league player limit to at least 3 in Edit league first.'}
              </p>
            ) : null}
            {startEvent.error ? <p className="text-sm text-destructive">{errorMessage(startEvent.error)}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={startEvent.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={startEvent.isPending || eventRuleBlocked} onClick={() => startEvent.mutate()}>
              {startEvent.isPending ? 'Creating…' : 'Create event'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {battleFormat === '1v1' && ownEntry?.status === 'accepted' ? (
        <OneOnOneBattleChooser
          key={league.eventToken}
          open={choosingBattle}
          ownUserId={ownEntry.userId}
          entries={oneOnOneEntrants}
          pending={battle.isPending}
          error={battle.error}
          onIntentChange={() => battle.reset()}
          onClose={closeBattleChooser}
          onStart={(opponentId) => battle.mutate({ opponentId }, { onSuccess: () => setChoosingBattle(false) })}
        />
      ) : null}
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
          onIntentChange={() => battle.reset()}
          onClose={closeBattleChooser}
          onStart={(players) => battle.mutate(players, { onSuccess: () => setChoosingBattle(false) })}
        />
      ) : null}
      {league.format === '2v2' && pairing ? (
        <LeagueTeamChooser
          open
          entrant={accepted.find((entry) => entry.userId === pairing.userId)!}
          entrantName={pairing.name}
          entries={accepted}
          projection={teamProjection}
          pending={assignTeam.isPending}
          error={assignTeam.error}
          onIntentChange={() => assignTeam.reset()}
          onClose={() => !assignTeam.isPending && closeTeamChooser()}
          onAssign={(userIds) => assignTeam.mutate(userIds)}
        />
      ) : null}
      {league.format === '2v2' && ownEntry?.status === 'accepted' ? (
        <DoublesBattleChooser
          key={league.eventToken}
          open={choosingBattle}
          ownUserId={ownEntry.userId}
          entries={accepted}
          projection={teamProjection}
          pending={battle.isPending}
          error={battle.error}
          onIntentChange={() => battle.reset()}
          onClose={closeBattleChooser}
          onStart={(opponentId) => battle.mutate({ opponentId }, { onSuccess: () => setChoosingBattle(false) })}
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
  onChoose: (roster: SavedRoster) => void
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
        {error || rosterQuery.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error ?? rosterQuery.error)}
          </p>
        ) : null}
        {rosterQuery.isPending ? (
          <RosterChooserSkeleton />
        ) : rosters.length ? (
          <div className="space-y-2">
            {rosters.map((roster) => (
              <button
                key={roster.id}
                type="button"
                data-roster={roster.name}
                className="flex w-full flex-wrap items-center gap-2 border border-edge bg-panel p-2 hover:border-azure disabled:cursor-wait disabled:opacity-70"
                disabled={pending}
                onClick={() => onChoose(roster)}
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

function LeagueBattleSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading battles">
      <Skeleton className="h-4 w-20" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex min-h-20 items-center gap-3 border border-edge bg-panel p-3" aria-hidden>
          <Skeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20 rounded-none" />
        </div>
      ))}
    </div>
  )
}

function RosterChooserSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading rosters">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex min-h-20 items-center gap-3 border border-edge bg-panel p-3" aria-hidden>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

/** One name for the button that starts a shape's battle and the dialog it opens. */
function startBattleLabel(format: TableShape) {
  return `Start ${TABLE_SHAPE_LABELS[format].count} battle`
}

function OneOnOneBattleChooser({
  open,
  ownUserId,
  entries,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  entries: { userId: string; name: string; image: string | null }[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (opponentId: string) => void
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setOpponentId(null)
  }, [open])
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const options = entries
    .filter((entry) => entry.userId !== ownUserId)
    .map((entry) => ({
      label: labels.get(entry.userId) ?? entry.name,
      value: entry.userId,
      icon: <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-[0.65rem]" />,
    }))
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent className="rounded-none border border-edge bg-panel text-bone sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">{startBattleLabel('1v1')}</DialogTitle>
          <DialogDescription className="text-dim">Choose another entrant. Both sealed rosters are added automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="league-opponent">Opponent</Label>
          <SearchableSelect
            id="league-opponent"
            groups={[{ label: '', items: options }]}
            value={opponentId ?? ''}
            onValueChange={(id) => {
              onIntentChange()
              setOpponentId(id)
            }}
            placeholder="Choose an opponent"
            searchPlaceholder="Search entrants…"
            className="h-11 rounded-none border-edge bg-sunken"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!opponentId || pending} onClick={() => opponentId && onStart(opponentId)}>
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
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
  onIntentChange,
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
  onIntentChange: () => void
  onClose: () => void
  onStart: (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) => void
}) {
  const [theirIds, setTheirIds] = useState<(string | null)[]>([null, null])
  const [allyId, setAllyId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) {
      setTheirIds([null, null])
      setAllyId(null)
    }
  }, [open])
  const alliedLimit = alliedLeagueRosterLimit(rosterLimit)
  // The organizer's roster assignment already says which side of the table this entrant is on.
  const isSolo = ownRequiredLimit === rosterLimit
  const seats = seatsFor('2v1', isSolo ? 'solo' : 'pair')
  const seatedIn = (seat: Seat) => (seat.side === 'yours' ? allyId : (theirIds[seat.at] ?? null))
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const candidates = entries.map((entry) => ({
    id: entry.userId,
    name: entry.name,
    image: entry.image,
    requiredLimit: entry.requiredLimit,
  }))
  // An ally seat is filled by an entrant assigned the allied size; the solo seat of a
  // pair's opponent by one assigned the full size. A seat nobody can fill offers nobody.
  const groupsFor = (seat: Seat, taken: ReadonlySet<string | null>) => {
    const wantsSolo = seat.side === 'theirs' && !isSolo
    const label = wantsSolo ? 'Solo entrants' : 'Allied entrants'
    const items = candidates
      .filter((entry) => entry.id !== ownUserId && !taken.has(entry.id))
      .filter((entry) => entry.requiredLimit === (wantsSolo ? rosterLimit : alliedLimit))
      .map((entry) => seatOption(entry, labels))
    return items.length ? [{ label, items }] : []
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent
        aria-busy={pending}
        className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">{startBattleLabel('2v1')}</DialogTitle>
          <DialogDescription className="text-dim">
            {isSolo ? 'Choose two allied entrants to face.' : 'Choose your allied teammate and the solo entrant to face.'}
          </DialogDescription>
        </DialogHeader>
        <SeatRows
          idPrefix="league-battle"
          seats={seats}
          seatedIn={seatedIn}
          groupsFor={groupsFor}
          onPick={(seat, id) => {
            onIntentChange()
            if (seat.side === 'yours') return setAllyId(id)
            setTheirIds((current) => current.map((held, at) => (at === seat.at ? id : held)))
          }}
        />
        <SeatMatchup seats={seats} labelFor={(seat) => seatLabel(seatedIn(seat), labels, candidates)} />
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
            disabled={!seats.every(seatedIn) || pending}
            onClick={() => {
              const players = seatedPlayers(seats, seatedIn)
              const [opponentId, secondOpponentId] = players.opponentIds
              if (!opponentId) return
              onStart(players.allyId ? { opponentId, allyId: players.allyId } : { opponentId, secondOpponentId })
            }}
          >
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LeagueTeamChooser({
  open,
  entrant,
  entrantName,
  entries,
  projection,
  pending,
  error,
  onIntentChange,
  onClose,
  onAssign,
}: {
  open: boolean
  entrant: DoublesEntrant
  entrantName: string
  entries: DoublesEntrant[]
  projection: DoublesTeamProjection
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onAssign: (userIds: string[]) => void
}) {
  const [teammateId, setTeammateId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ userIds: string[]; sealedNames: string[] } | null>(null)
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const candidates = entries.filter((entry) => entry.userId !== entrant.userId)
  const currentTeam = entrant.teamId ? projection.teams.find((team) => team.id === entrant.teamId) : undefined
  const currentTeammate = currentTeam?.entries.find((entry) => entry.userId !== entrant.userId)
  const requestAssignment = (userIds: string[]) => {
    const selected = entries.filter((entry) => userIds.includes(entry.userId))
    const existingTeamIds = new Set(selected.flatMap((entry) => (entry.teamId ? [entry.teamId] : [])))
    const affected = entries.filter((entry) => userIds.includes(entry.userId) || (entry.teamId && existingTeamIds.has(entry.teamId)))
    const unchanged =
      userIds.length === 2 && entrant.teamId !== null && selected.length === 2 && selected.every((entry) => entry.teamId === entrant.teamId)
    const sealedNames = unchanged ? [] : affected.filter((entry) => entry.submitted).map((entry) => labels.get(entry.userId) ?? entry.name)
    if (sealedNames.length) {
      setConfirmation({ userIds, sealedNames })
      return
    }
    onIntentChange()
    onAssign(userIds)
  }
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
        <DialogContent
          aria-busy={pending}
          className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl uppercase">Assign {entrantName}’s team</DialogTitle>
            <DialogDescription className="text-dim">
              {currentTeam && currentTeammate
                ? `Currently paired with ${labels.get(currentTeammate.userId) ?? currentTeammate.name}. `
                : ''}
              Choose one teammate. Re-pairing or unpairing changes the official force composition and discards every affected sealed roster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="league-team-teammate">Teammate</Label>
            <SearchableSelect
              id="league-team-teammate"
              ariaLabel={`Teammate for ${entrantName}`}
              groups={[
                {
                  label: '',
                  items: candidates.map((entry) => ({
                    label: `${labels.get(entry.userId) ?? entry.name}${
                      entry.teamId
                        ? ` · paired with ${
                            labels.get(
                              projection.members.get(entry.teamId)?.find((member) => member.userId !== entry.userId)?.userId ?? '',
                            ) ?? 'teammate'
                          }`
                        : ''
                    }`,
                    value: entry.userId,
                    icon: <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-[0.65rem]" />,
                  })),
                },
              ]}
              value={teammateId ?? ''}
              onValueChange={(id) => {
                onIntentChange()
                setTeammateId(id)
              }}
              placeholder="Choose a teammate"
              searchPlaceholder="Search entrants…"
              className="h-11 rounded-none border-edge bg-sunken"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error)}
            </p>
          ) : null}
          {pending ? <output className="sr-only">Changing doubles team…</output> : null}
          <DialogFooter>
            {entrant.teamId ? (
              <Button variant="destructive" disabled={pending} onClick={() => requestAssignment([entrant.userId])}>
                Unpair team
              </Button>
            ) : null}
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!teammateId || pending} onClick={() => teammateId && requestAssignment([entrant.userId, teammateId])}>
              {pending ? 'Assigning…' : 'Assign team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(next) => {
          if (!pending && !next) {
            onIntentChange()
            setConfirmation(null)
          }
        }}
      >
        <AlertDialogContent aria-busy={pending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Clear sealed doubles rosters?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              This team change will clear the sealed {confirmation?.sealedNames.length === 1 ? 'roster' : 'rosters'} for{' '}
              {confirmation ? formatNames(confirmation.sealedNames) : ''}. Every affected entrant must seal another roster before reveal.
            </AlertDialogDescription>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(error)}
              </p>
            ) : null}
            {pending ? <output className="sr-only">Changing doubles team…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep current teams</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                if (!confirmation) return
                onIntentChange()
                onAssign(confirmation.userIds)
              }}
            >
              {pending ? 'Clearing…' : 'Change team and clear rosters'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function DoublesBattleChooser({
  open,
  ownUserId,
  entries,
  projection,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  entries: DoublesEntrant[]
  projection: DoublesTeamProjection
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (opponentId: string) => void
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setOpponentId(null)
  }, [open])
  const ownTeamId = entries.find((entry) => entry.userId === ownUserId)?.teamId
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const options = projection.teams
    .filter((team) => team.id !== ownTeamId && team.entries.length === 2)
    .map((team) => ({
      label: team.entries.map((entry) => labels.get(entry.userId) ?? entry.name).join(' & '),
      value: team.entries[0]!.userId,
      icon: <PlayerAvatar name={team.entries[0]!.name} image={team.entries[0]!.image} className="size-6 text-[0.65rem]" />,
    }))
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent
        aria-busy={pending}
        className="max-h-[85dvh] overflow-x-hidden overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg [&>*]:min-w-0"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">{startBattleLabel('2v2')}</DialogTitle>
          <DialogDescription className="text-dim">
            Choose an opposing fixed team. Your teammate and all four sealed rosters are added automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="league-doubles-opponents">Opposing team</Label>
          <SearchableSelect
            id="league-doubles-opponents"
            groups={[{ label: '', items: options }]}
            value={opponentId ?? ''}
            onValueChange={(id) => {
              onIntentChange()
              setOpponentId(id)
            }}
            placeholder="Choose an opposing team"
            searchPlaceholder="Search teams or entrants…"
            className="h-11 rounded-none border-edge bg-sunken"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        {pending ? <output className="sr-only">Starting doubles battle…</output> : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!opponentId || pending} onClick={() => opponentId && onStart(opponentId)}>
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DoublesEntrant = {
  userId: string
  name: string
  image: string | null
  teamId: string | null
  submitted: boolean
}

type DoublesTeamProjection = {
  members: Map<string, DoublesEntrant[]>
  teams: { id: string; entries: DoublesEntrant[] }[]
}

function projectDoublesTeams(entries: DoublesEntrant[]): DoublesTeamProjection {
  const members = new Map<string, DoublesEntrant[]>()
  for (const entry of entries) {
    if (entry.teamId) members.set(entry.teamId, [...(members.get(entry.teamId) ?? []), entry])
  }
  return {
    members,
    teams: [...members].map(([id, teamEntries]) => ({ id, entries: teamEntries })),
  }
}

function formatNames(names: string[]) {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
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
