import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, FileLock2, Pencil, ShieldCheck, Swords, TriangleAlert, UserPlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
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
import { GAME_SIZES } from '../../../core/battle'
import { leagueRegistrationFull, leagueTableShape, readsAlliedLeagueRoster, type LeagueEntryView } from '../../../core/league'
import { createLeagueBattle, joinLeague, submitLeagueRoster } from '../../../server/functions'
import { rosterWaivers, WaiverList } from '../../components/FormatWaivers'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { battlesQuery, gameReferencesQuery, leagueBattlesFrom, leagueBattlesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { BattleShelf } from '../battles/BattleShelf'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { DoublesBattleChooser, LeagueBattleChooser, OneOnOneBattleChooser, startBattleLabel } from './LeagueBattleChoosers'
import { EntrantGroup, EntrantList, EntrantRow, SectionHeading, sealStatus, sideGroups, ViewRosterButton } from './LeagueEntrants'
import { doublesTeams, entryProgress, formatNames, soloOrAllied, useLeagueRefresh, type EntryStep, type League } from './leagueEvent'
import { LeagueBattleSkeleton, RosterChooser } from './LeagueRosterChooser'

type Action =
  | { label: string; icon?: ReactNode; variant?: 'default' | 'outline'; pending?: boolean; onClick: () => void }
  | { label: string; to: 'sign-in' | 'organize' }

type Status = { title: string; detail?: string; tone?: 'sealed' | 'waiting' | 'closed'; action?: Action; steps?: EntryStep[] }

export function LeagueEventView({
  league,
  token,
  viewerId,
  isOwner,
  startBattle,
  chooseRoster,
  onOrganize,
}: {
  league: League
  token: string
  viewerId: string | null
  isOwner: boolean
  startBattle?: boolean
  chooseRoster?: boolean
  onOrganize: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = useLeagueRefresh(token)
  const battleHistory = useInfiniteQuery({
    ...leagueBattlesQuery(token, league.eventToken),
    enabled: Boolean(league.revealedAt),
  })
  const [choosing, setChoosing] = useState(Boolean(chooseRoster))
  const [sealing, setSealing] = useState<SavedRoster | null>(null)
  const [choosingBattle, setChoosingBattle] = useState(Boolean(startBattle))
  const join = useMutation({ mutationFn: () => joinLeague({ data: { token, eventToken: league.eventToken } }), onSuccess: refresh })
  const submit = useMutation({
    mutationFn: (rosterId: string) => submitLeagueRoster({ data: { token, eventToken: league.eventToken, rosterId } }),
    onSuccess: async () => {
      setChoosing(false)
      await refresh()
    },
  })
  const battle = useMutation({
    mutationFn: async (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) => {
      const references = await queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
      return createLeagueBattle({
        data: { token, eventToken: league.eventToken, ...players, missionPackId: references?.packs[0]?.id ?? null },
      })
    },
    onSuccess: async ({ token: battleToken }) => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token: battleToken } })
    },
  })
  const openRosterChooser = () => {
    submit.reset()
    setChoosing(true)
  }
  const openBattleChooser = () => {
    battle.reset()
    setChoosingBattle(true)
  }
  const closeBattleChooser = () => {
    battle.reset()
    setChoosingBattle(false)
  }

  const eventBattles = leagueBattlesFrom(battleHistory.data)
  const ownEntry = viewerId ? league.entries.find((entry) => entry.userId === viewerId) : undefined
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const sealedEntrants = accepted.filter((entry) => entry.submitted)
  const labels = disambiguatedPlayerLabels(league.entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const label = (entry: LeagueEntryView) => labels.get(entry.userId) ?? entry.name
  const battleFormat = leagueTableShape(league.format)
  const teams = doublesTeams(accepted)
  const ownTeam = league.format === '2v2' && ownEntry?.teamId ? (teams.find((team) => team.id === ownEntry.teamId)?.members ?? []) : []
  const ownSideSealed = league.format !== '2v2' || (ownTeam.length === 2 && ownTeam.every((entry) => entry.submitted))
  // A legacy event fixed no size, so a 1v1 there is only between lists sealed at the same one.
  const oneOnOneEntrants =
    league.format === null
      ? sealedEntrants.filter(
          (entry) =>
            typeof ownEntry?.sealedLimit === 'number' &&
            GAME_SIZES.some((size) => size.limit === ownEntry.sealedLimit) &&
            entry.sealedLimit === ownEntry.sealedLimit,
        )
      : sealedEntrants
  // Reveal opens every sealed list; before it, an ally reads the list they will field beside.
  const readsRoster = (entry: LeagueEntryView) =>
    entry.submitted &&
    entry.userId !== viewerId &&
    (Boolean(league.revealedAt) || readsAlliedLeagueRoster(league.format, league.rosterLimit, ownEntry ?? null, entry))
  const allies =
    ownEntry && !league.revealedAt
      ? accepted.filter((entry) => readsAlliedLeagueRoster(league.format, league.rosterLimit, entry, ownEntry))
      : []
  const registrationFull = leagueRegistrationFull(league, accepted.length, league.occupiedCount)
  const latest = league.events[0]?.token === league.eventToken
  const status = entryStatus({
    league,
    ownEntry,
    signedIn: viewerId !== null,
    isOwner,
    registrationFull,
    ownSideSealed,
    allies: allies.map(label),
    latest,
    join: () => join.mutate(),
    joining: join.isPending,
    choose: openRosterChooser,
    play: openBattleChooser,
    playing: battle.isPending,
  })
  const problem = join.error ?? (league.format === '2v1' || league.format === '2v2' ? null : battle.error)
  const sealWaivers = sealing ? rosterWaivers(sealing) : []
  const row = (entry: LeagueEntryView, detail: ReactNode = sealStatus(entry, Boolean(league.revealedAt))) => (
    <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail={detail}>
      {readsRoster(entry) ? (
        <ViewRosterButton token={token} eventToken={league.eventToken} userId={entry.userId} label={label(entry)} />
      ) : null}
    </EntrantRow>
  )
  const sides = sideGroups(league)

  return (
    <>
      <EntryStatusCard status={status} problem={problem} token={token} onOrganize={onOrganize} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionHeading title="Entrants" count={accepted.length} />
            {!accepted.length ? (
              <div className="border border-edge bg-panel px-5 py-9 text-center">
                <UserPlus className="mx-auto size-7 text-faint" />
                <p className="mt-3 font-bold uppercase">No entrants yet</p>
                <p className="mt-1 text-sm text-dim">Players show up here once they’re in.</p>
              </div>
            ) : league.format === '2v1' ? (
              <div className="space-y-4">
                {(['solo', 'allied', 'unsized'] as const).map((side) => {
                  const members = accepted.filter((entry) => (soloOrAllied(league, entry) ?? 'unsized') === side)
                  if (!members.length) return null
                  return (
                    <EntrantGroup key={side} group={side} title={sides[side].title} detail={sides[side].detail}>
                      <EntrantList>{members.map((entry) => row(entry))}</EntrantList>
                    </EntrantGroup>
                  )
                })}
              </div>
            ) : league.format === '2v2' ? (
              <div className="space-y-4">
                {teams.map((team, index) => (
                  <EntrantGroup
                    key={team.id}
                    group={`team-${index + 1}`}
                    title={`Team ${index + 1}`}
                    detail={formatNames(team.members.map(label))}
                  >
                    <EntrantList>{team.members.map((entry) => row(entry))}</EntrantList>
                  </EntrantGroup>
                ))}
                {accepted.some((entry) => !entry.teamId) ? (
                  <EntrantGroup group="unpaired" title="Waiting for a teammate">
                    <EntrantList>{accepted.filter((entry) => !entry.teamId).map((entry) => row(entry))}</EntrantList>
                  </EntrantGroup>
                ) : null}
              </div>
            ) : (
              <EntrantList>{accepted.map((entry) => row(entry))}</EntrantList>
            )}
          </section>

          {league.revealedAt ? (
            <section>
              {eventBattles.length ? (
                <>
                  <BattleShelf title="Battles" battles={eventBattles} />
                  {battleHistory.hasNextPage ? (
                    <Button
                      className="mt-2"
                      variant="outline"
                      size="sm"
                      disabled={battleHistory.isFetchingNextPage}
                      onClick={() => void battleHistory.fetchNextPage()}
                    >
                      {battleHistory.isFetchingNextPage ? 'Loading…' : 'Show more battles'}
                    </Button>
                  ) : null}
                </>
              ) : battleHistory.isPending ? (
                <LeagueBattleSkeleton />
              ) : (
                <>
                  <SectionHeading title="Battles" count={0} />
                  <div className="border border-edge bg-panel px-5 py-7 text-center">
                    <Swords className="mx-auto size-7 text-faint" />
                    <p className="mt-3 font-bold uppercase">No battles yet</p>
                    <p className="mt-1 text-sm text-dim">Battles from this event show up here.</p>
                  </div>
                </>
              )}
            </section>
          ) : null}
        </div>

        <aside className="h-fit border border-edge bg-panel p-4 text-sm">
          <h2 className="rubric">How it works</h2>
          <ol className="mt-3 space-y-2 text-dim">
            <li>
              <span className="font-semibold text-bone">Seal</span> a list. Later edits to it don’t change the sealed copy.
            </li>
            {league.format === '2v1' ? (
              <li>
                <span className="font-semibold text-bone">Solo</span> plays alone; <span className="font-semibold text-bone">allied</span>{' '}
                plays beside another ally, who can see your list.
              </li>
            ) : null}
            {league.format === '2v2' ? (
              <li>
                <span className="font-semibold text-bone">Teams</span> of two share one Warlord and can see each other’s lists.
              </li>
            ) : null}
            <li>
              <span className="font-semibold text-bone">Reveal</span> opens every list at once.
            </li>
            <li>
              <span className="font-semibold text-bone">Play</span> from here once the lists are out.
            </li>
          </ol>
        </aside>
      </div>

      <RosterChooser
        open={choosing}
        pending={submit.isPending}
        error={submit.error}
        requiredLimit={ownEntry?.requiredLimit ?? null}
        onClose={() => {
          if (submit.isPending) return
          submit.reset()
          setChoosing(false)
        }}
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
        <AlertDialogContent aria-busy={submit.isPending} className="border-discarded/50 sm:max-w-lg [&>*]:min-w-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-discarded">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              {sealWaivers.length === 1 ? 'This roster waives a rule' : `This roster waives ${sealWaivers.length} rules`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {sealing?.name} is not playing {sealWaivers.length === 1 ? 'one of' : 'some of'} the rules of its battle size:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <WaiverList rules={sealWaivers} />
          <p className="text-sm text-dim">
            Praetorium has not checked {sealWaivers.length === 1 ? 'it' : 'them'}, so this list may not be legal here. The organizer and
            every opponent see what it waives at reveal.
          </p>
          <AlertDialogFooter className="sm:flex-wrap">
            {sealing ? (
              <Button
                variant="outline"
                nativeButton={false}
                className="sm:mr-auto"
                render={<Link to="/rosters/$id" params={{ id: sealing.id }} />}
              >
                <Pencil /> Edit roster
              </Button>
            ) : null}
            <AlertDialogCancel disabled={submit.isPending}>Choose another</AlertDialogCancel>
            <AlertDialogAction
              disabled={submit.isPending}
              onClick={() => {
                if (sealing) submit.mutate(sealing.id)
                setSealing(null)
              }}
            >
              Seal it anyway
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
          entries={sealedEntrants}
          pending={battle.isPending}
          error={battle.error}
          onIntentChange={() => battle.reset()}
          onClose={closeBattleChooser}
          onStart={(players) => battle.mutate(players, { onSuccess: () => setChoosingBattle(false) })}
        />
      ) : null}
      {league.format === '2v2' && ownEntry?.status === 'accepted' ? (
        <DoublesBattleChooser
          key={league.eventToken}
          open={choosingBattle}
          ownUserId={ownEntry.userId}
          entries={accepted}
          pending={battle.isPending}
          error={battle.error}
          onIntentChange={() => battle.reset()}
          onClose={closeBattleChooser}
          onStart={(opponentId) => battle.mutate({ opponentId }, { onSuccess: () => setChoosingBattle(false) })}
        />
      ) : null}
    </>
  )
}

/** The one thing a reader can do in this event right now, and what they are waiting for when it is nothing. */
function entryStatus({
  league,
  ownEntry,
  signedIn,
  isOwner,
  registrationFull,
  ownSideSealed,
  allies,
  latest,
  join,
  joining,
  choose,
  play,
  playing,
}: {
  league: League
  ownEntry: LeagueEntryView | undefined
  signedIn: boolean
  isOwner: boolean
  registrationFull: boolean
  ownSideSealed: boolean
  allies: string[]
  latest: boolean
  join: () => void
  joining: boolean
  choose: () => void
  play: () => void
  playing: boolean
}): Status {
  const steps = entryProgress(league, ownEntry)
  const revealed = Boolean(league.revealedAt)
  const hidden = allies.length
    ? `Only ${allies.length > 2 ? `${allies.length} allies` : formatNames(allies)} can see it before the reveal.`
    : 'Hidden until the reveal.'
  if (!ownEntry || ownEntry.status !== 'accepted') {
    if (revealed) return { title: 'Rosters are revealed', detail: 'Battles from this event appear below.', tone: 'closed' }
    if (!signedIn) return { title: 'Registration is open', action: { label: 'Sign in to join', to: 'sign-in' }, steps }
    if (ownEntry?.status === 'pending')
      return { title: 'Waiting for approval', detail: `${league.ownerName} will let you in.`, tone: 'waiting', steps }
    const rejoin = ownEntry?.status === 'rejected'
    if (registrationFull) return { title: rejoin ? 'You are not in this event' : 'This event is full', tone: 'closed' }
    if (isOwner && !rejoin)
      return {
        title: 'You are running this event',
        detail: 'Playing too?',
        action: { label: 'Join as a player', icon: <UserPlus />, variant: 'outline', pending: joining, onClick: join },
      }
    return {
      title: rejoin ? 'You are not in this event' : 'Join this event',
      detail: rejoin
        ? 'Your request was turned down.'
        : league.admission === 'approval'
          ? `${league.ownerName} approves each player.`
          : undefined,
      action: { label: rejoin ? 'Request to join again' : 'Join event', icon: <UserPlus />, pending: joining, onClick: join },
      steps,
    }
  }
  if (!revealed && ownEntry.requiredLimit === null && (league.format === '2v1' || league.format === '2v2')) {
    const doubles = league.format === '2v2'
    return {
      title: doubles ? 'Waiting for a teammate' : 'Waiting for your size',
      detail: isOwner
        ? doubles
          ? 'Pair yourself under Organize.'
          : 'Give yourself a size under Organize.'
        : doubles
          ? `${league.ownerName} pairs players into teams.`
          : `${league.ownerName} decides who plays solo or allied.`,
      tone: 'waiting',
      action: isOwner ? { label: 'Go to Organize', to: 'organize' } : undefined,
      steps,
    }
  }
  const size = ownEntry.requiredLimit ? `${ownEntry.requiredLimit.toLocaleString()}-point ` : ''
  if (!ownEntry.submitted)
    return {
      title: revealed ? 'Seal another list' : `Seal your ${size}list`,
      detail: revealed ? 'The organizer unsealed your list.' : hidden,
      action: { label: 'Choose a list', icon: <FileLock2 />, onClick: choose },
      steps,
    }
  if (!revealed)
    return {
      title: `${ownEntry.rosterName ?? 'Your list'} is sealed`,
      detail: hidden,
      tone: 'sealed',
      action: { label: 'Swap list', variant: 'outline', onClick: choose },
      steps,
    }
  if (!ownSideSealed) return { title: 'Waiting for your teammate', detail: 'They are sealing another list.', tone: 'waiting', steps }
  return {
    title: latest ? 'Rosters are out' : 'Rosters are revealed',
    action: { label: startBattleLabel(leagueTableShape(league.format)), icon: <Swords />, pending: playing, onClick: play },
    steps,
  }
}

function EntryStatusCard({
  status,
  problem,
  token,
  onOrganize,
}: {
  status: Status
  problem: Error | null
  token: string
  onOrganize: () => void
}) {
  const { action } = status
  return (
    <section
      data-entry-status
      aria-labelledby="league-entry-status"
      className={`border bg-panel p-4 sm:p-5 ${status.tone === 'sealed' ? 'border-achieved/50' : 'border-edge'}`}
    >
      {status.steps ? <EntryProgress steps={status.steps} /> : null}
      <div className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-3 ${status.steps ? 'mt-4' : ''}`}>
        <div className="min-w-0 flex-1 basis-72">
          <h2
            id="league-entry-status"
            className={`flex items-center gap-2 text-xl font-bold uppercase ${status.tone === 'sealed' ? 'text-achieved' : ''}`}
          >
            {status.tone === 'sealed' ? <ShieldCheck className="size-5 shrink-0" aria-hidden /> : null}
            <span className="min-w-0 break-words">{status.title}</span>
          </h2>
          {status.detail ? <p className="mt-1 max-w-2xl text-sm text-dim">{status.detail}</p> : null}
        </div>
        {action ? (
          'to' in action ? (
            action.to === 'sign-in' ? (
              <Button
                size="lg"
                className="max-sm:w-full pointer-coarse:h-11"
                nativeButton={false}
                render={<Link to="/sign-in" search={{ next: `/leagues/${token}` }} />}
              >
                {action.label}
              </Button>
            ) : (
              <Button size="lg" variant="outline" className="max-sm:w-full pointer-coarse:h-11" onClick={onOrganize}>
                {action.label}
              </Button>
            )
          ) : (
            <Button
              size="lg"
              variant={action.variant ?? 'default'}
              className="max-sm:w-full pointer-coarse:h-11"
              disabled={action.pending}
              onClick={action.onClick}
            >
              {action.icon} {action.label}
            </Button>
          )
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errorMessage(problem)}
        </p>
      ) : null}
    </section>
  )
}

function EntryProgress({ steps }: { steps: EntryStep[] }) {
  return (
    <ol
      aria-label="Your progress"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs font-semibold tracking-label uppercase"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={`flex items-center gap-1.5 ${step.state === 'done' ? 'text-achieved' : step.state === 'current' ? 'text-parchment' : 'text-faint'}`}
        >
          {index ? <span aria-hidden className="h-px w-2 bg-edge-strong sm:w-5" /> : null}
          <span
            aria-hidden
            className={`flex size-5 items-center justify-center rounded-full border text-3xs ${step.state === 'done' ? 'border-achieved bg-achieved/15' : step.state === 'current' ? 'border-parchment bg-parchment/15' : 'border-edge-strong'}`}
          >
            {step.state === 'done' ? <Check className="size-3" strokeWidth={3} /> : index + 1}
          </span>
          {/* A phone keeps only the step being taken in words; the numbered marks still show how far along it is. */}
          <span className={step.state === 'current' ? undefined : 'max-sm:sr-only'}>
            {step.label}
            {step.state === 'done' ? <span className="sr-only"> (done)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}
