import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  leagueRegistrationFull,
  leagueTableShape,
  readsAlliedLeagueRoster,
  readsSealedLeagueRoster,
  type LeagueEntryView,
} from '../../../core/league'
import { createLeagueBattle, joinLeague, submitLeagueRoster } from '../../functions'
import { rosterWaivers, WaiverList } from '../../components/FormatWaivers'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { battlesQuery, gameReferencesQuery, leagueBattlesFrom, leagueBattlesQuery, leagueResultsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { BattleShelf } from '../battles/BattleShelf'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { DoublesBattleChooser, LeagueBattleChooser, OneOnOneBattleChooser, startBattleLabel } from './LeagueBattleChoosers'
import { EntrantGroup, EntrantList, EntrantRow, SectionHeading, sealStatus, ViewRosterButton } from './LeagueEntrants'
import {
  doublesTeams,
  entrantGroups,
  entryProgress,
  formatNames,
  namesPhrase,
  useLeagueRefresh,
  type EntryStage,
  type EntryStep,
  type League,
} from './leagueEvent'
import { InvitePanel, NextEventPanel, OrganizerEntrants } from './LeagueOrganizer'
import { LeagueArmies, type ArmyGroup } from './LeagueArmies'
import { LeagueReadiness } from './LeagueReadiness'
import { LeagueBattleSkeleton, RosterChooser } from './LeagueRosterChooser'
import { LeagueCombatDialog } from './LeagueCombatDialog'
import { LeagueResults } from './LeagueResults'
import { TeamDispositionPanel } from './LeagueTeamDisposition'

type Action =
  | { label: string; icon?: ReactNode; variant?: 'default' | 'outline'; pending?: boolean; onClick: () => void }
  | { label: string; to: '/sign-in' | '/leagues' }

type Status = { title: string; detail?: string; tone?: 'sealed' | 'waiting' | 'closed'; action?: Action; steps?: EntryStep[] }

export function LeagueEventView({
  league,
  token,
  viewerId,
  isOrganizer,
  startBattle,
  chooseRoster,
}: {
  league: League
  token: string
  viewerId: string | null
  isOrganizer: boolean
  startBattle?: boolean
  chooseRoster?: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = useLeagueRefresh(token)
  const battleHistory = useInfiniteQuery({
    ...leagueBattlesQuery(token, league.eventToken),
    enabled: Boolean(league.revealedAt),
  })
  const { data: results } = useQuery({ ...leagueResultsQuery(token, league.eventToken), enabled: Boolean(league.revealedAt) })
  const { data: gameReferences } = useQuery(gameReferencesQuery())
  const [choosing, setChoosing] = useState(Boolean(chooseRoster))
  const [sealing, setSealing] = useState<SavedRoster | null>(null)
  const [choosingBattle, setChoosingBattle] = useState(Boolean(startBattle))
  const [simulating, setSimulating] = useState<string | null>(null)
  // A join can wait in the offline queue, so the chooser opens once the league shows the entry, not on the reply.
  const [chooseOnEntry, setChooseOnEntry] = useState(false)
  const join = useMutation({
    mutationFn: () => joinLeague({ data: { token, eventToken: league.eventToken } }),
    onSuccess: async () => {
      setChooseOnEntry(true)
      await refresh()
    },
  })
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
  const entryStatusNow = ownEntry?.status
  // A duel needs nothing from the organizer before a list, so a new entrant's next step opens straight away.
  const duel = league.format !== '2v1' && league.format !== '2v2'
  if (chooseOnEntry && entryStatusNow === 'accepted') {
    setChooseOnEntry(false)
    if (duel && !league.revealedAt) setChoosing(true)
  }
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const sealedEntrants = accepted.filter((entry) => entry.submitted)
  const labels = disambiguatedPlayerLabels(league.entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const label = (entry: LeagueEntryView) => labels.get(entry.userId) ?? entry.name
  const battleFormat = leagueTableShape(league.format)
  const ownTeam = ownEntry?.teamId ? (doublesTeams(accepted).find((team) => team.id === ownEntry.teamId)?.members ?? []) : []
  const ownSideSealed =
    league.format === '2v2' || ownEntry?.teamId ? ownTeam.length === 2 && ownTeam.every((entry) => entry.submitted) : true
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
  const revealed = Boolean(league.revealedAt)
  const readsRoster = (entry: LeagueEntryView) =>
    entry.submitted && readsSealedLeagueRoster(league.format, league.rosterLimit, ownEntry ?? null, entry)
  const allies =
    ownEntry && !league.revealedAt
      ? accepted.filter((entry) => readsAlliedLeagueRoster(league.format, league.rosterLimit, entry, ownEntry))
      : []
  const met = new Set(results?.met.flatMap(([one, other]) => (one === viewerId ? [other] : other === viewerId ? [one] : [])))
  const opponents = oneOnOneEntrants.filter((entry) => entry.userId !== viewerId)
  const yetToPlay = opponents.filter((entry) => !met.has(entry.userId)).map(label)
  // A duel entrant hears who is left to play; a blank line holds its height while results load, so the page does not jump.
  const playDetail =
    battleFormat !== '1v1' || !ownEntry?.submitted || !league.revealedAt
      ? undefined
      : !opponents.length
        ? 'Nobody else is playing in this event.'
        : !results
          ? '\u00a0'
          : yetToPlay.length
            ? `Still to play: ${namesPhrase(yetToPlay)}.`
            : 'You have played everyone. Rematches count too.'
  const registrationFull = leagueRegistrationFull(league, accepted.length, league.occupiedCount)
  const latest = league.events[0]?.token === league.eventToken
  const status = entryStatus({
    league,
    ownEntry,
    signedIn: viewerId !== null,
    isOrganizer,
    registrationFull,
    ownSideSealed,
    allies: allies.map(label),
    playDetail,
    alone: battleFormat === '1v1' && !opponents.length,
    latest,
    join: () => join.mutate(),
    joining: join.isPending,
    choose: openRosterChooser,
    play: openBattleChooser,
    playing: battle.isPending,
  })
  const problem = join.error ?? (league.format === '2v1' || league.format === '2v2' ? null : battle.error)
  const sealWaivers = sealing ? rosterWaivers(sealing) : []
  // Before the reveal a row offers only your own or an ally's list; once the lists are out, the cards carry every one.
  const row = (entry: LeagueEntryView, detail: ReactNode = sealStatus(entry, revealed), controls?: ReactNode, last?: ReactNode) => (
    <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail={detail}>
      {controls}
      {!revealed && readsRoster(entry) ? (
        <ViewRosterButton token={token} eventToken={league.eventToken} userId={entry.userId} label={label(entry)} />
      ) : null}
      {last}
    </EntrantRow>
  )
  // A pair names the card it sealed once the reader may see it: its own members before the reveal, everyone after.
  const pairNames = (members: LeagueEntryView[]) => {
    const card = league.entries.find((entry) => entry.userId === members[0]?.userId)?.team?.disposition
    const named = card ? (gameReferences?.dispositions.find((disposition) => disposition.id === card)?.name ?? card) : null
    return [formatNames(members.map(label)), named && `plays ${named}`].filter(Boolean).join(' · ')
  }
  const groups = entrantGroups(league, accepted, pairNames)
  // The revealed lists split by side or pair the way the entrant list does, so a pairing reads the same before and after.
  const armyGroups: ArmyGroup[] = groups
  // Once the lists are out, each player shows with their list, so the entrant list has nothing left to say.
  const entrants = revealed ? null : isOrganizer ? (
    <OrganizerEntrants league={league} token={token} row={row} />
  ) : (
    <section>
      <SectionHeading title="Entrants" count={accepted.length} />
      {!accepted.length ? (
        <div className="border border-edge bg-panel px-5 py-9 text-center">
          <UserPlus className="mx-auto size-7 text-faint" />
          <p className="mt-3 font-bold uppercase">No entrants yet</p>
          <p className="mt-1 text-sm text-dim">Players show up here once they’re in.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) =>
            group.title ? (
              <EntrantGroup key={group.key} group={group.key} title={group.title} detail={group.detail}>
                <EntrantList>{group.entries.map((entry) => row(entry))}</EntrantList>
              </EntrantGroup>
            ) : (
              <EntrantList key={group.key}>{group.entries.map((entry) => row(entry))}</EntrantList>
            ),
          )}
        </div>
      )}
    </section>
  )
  const aside = isOrganizer ? (
    <aside className="space-y-3">
      {latest && !revealed ? <InvitePanel league={league} /> : null}
      {latest && revealed ? <NextEventPanel league={league} /> : null}
    </aside>
  ) : null

  return (
    <>
      {simulating && revealed && ownEntry?.submitted && viewerId ? (
        <LeagueCombatDialog
          token={token}
          eventToken={league.eventToken}
          viewerId={viewerId}
          opponentId={simulating}
          entries={sealedEntrants.map((entry) => ({ userId: entry.userId, label: label(entry) }))}
          onClose={() => setSimulating(null)}
        />
      ) : null}
      {/* The reader's own next step leads the side column, and a phone, where it comes first. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-2 lg:row-start-1">
          <EntryStatusCard status={status} problem={problem} token={token} />
          {!revealed && ownEntry?.team && ownEntry.team.choices.length > 1 ? (
            <div className="mt-3">
              <TeamDispositionPanel token={token} eventToken={league.eventToken} team={ownEntry.team} />
            </div>
          ) : null}
        </div>
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {!revealed && (isOrganizer || accepted.length) ? (
            <LeagueReadiness league={league} token={token} viewerId={viewerId} isOrganizer={isOrganizer} label={label} />
          ) : null}
          {revealed ? (
            <LeagueArmies
              token={token}
              eventToken={league.eventToken}
              groups={armyGroups}
              viewerId={viewerId}
              revealedBy={league.revealedByName}
              label={label}
              canUnseal={isOrganizer}
              onSimulate={ownEntry?.status === 'accepted' && ownEntry.submitted ? setSimulating : null}
            />
          ) : null}
          {revealed ? (
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
                    <p className="mt-1 text-sm text-dim">Battles started from this page show up here.</p>
                  </div>
                </>
              )}
            </section>
          ) : null}
          {results?.rows.some((result) => result.played) ? (
            <LeagueResults rows={results.rows} partial={results.partial} entries={accepted} label={label} />
          ) : null}
          {entrants}
        </div>
        <div className="lg:col-start-2">{aside}</div>
      </div>

      <RosterChooser
        open={choosing}
        pending={submit.isPending}
        error={submit.error}
        failedRosterId={submit.variables ?? null}
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
  isOrganizer,
  registrationFull,
  ownSideSealed,
  allies,
  playDetail,
  alone,
  latest,
  join,
  joining,
  choose,
  play,
  playing,
}: {
  league: League
  ownEntry: League['entries'][number] | undefined
  signedIn: boolean
  isOrganizer: boolean
  registrationFull: boolean
  ownSideSealed: boolean
  allies: string[]
  /** Who a duel entrant has left to play, once the lists are out. */
  playDetail: string | undefined
  /** A duel with nobody else in it, where there is no battle to start. */
  alone: boolean
  latest: boolean
  join: () => void
  joining: boolean
  choose: () => void
  play: () => void
  playing: boolean
}): Status {
  const steps = (stage: EntryStage) => entryProgress(league, stage)
  const revealed = Boolean(league.revealedAt)
  const hidden = allies.length
    ? `Only ${allies.length > 2 ? `${allies.length} allies` : formatNames(allies)} can see it before the reveal.`
    : 'Hidden until the reveal.'
  if (!ownEntry || ownEntry.status !== 'accepted') {
    if (revealed && isOrganizer)
      return { title: 'The lists are out', detail: 'You run this league without a list of your own.', tone: 'closed' }
    if (revealed)
      return {
        title: 'The lists are out',
        detail: `Everyone here sealed a list in secret, the lists opened together, and now they play each other. ${league.ownerName} runs it.`,
        tone: 'closed',
        action: signedIn ? { label: 'Start your own league', to: '/leagues' } : undefined,
      }
    if (!signedIn) return { title: 'Registration is open', action: { label: 'Sign in to join', to: '/sign-in' }, steps: steps('join') }
    if (ownEntry?.status === 'pending')
      return { title: 'Waiting for approval', detail: `${league.ownerName} will let you in.`, tone: 'waiting', steps: steps('join') }
    const rejoin = ownEntry?.status === 'rejected'
    if (registrationFull) return { title: rejoin ? 'You are not in this league' : 'This league is full', tone: 'closed' }
    if (isOrganizer && !rejoin)
      return {
        title: 'You are not playing',
        detail: 'You run this league without a list of your own.',
        action: { label: 'Join as a player', icon: <UserPlus />, variant: 'outline', pending: joining, onClick: join },
      }
    return {
      title: rejoin ? 'You are not in this league' : 'Join this league',
      detail: rejoin
        ? 'Your request was turned down.'
        : league.admission === 'approval'
          ? `${league.ownerName} approves each player.`
          : undefined,
      action: { label: rejoin ? 'Request to join again' : 'Join league', icon: <UserPlus />, pending: joining, onClick: join },
      steps: steps('join'),
    }
  }
  if (!revealed && ownEntry.requiredLimit === null && (league.format === '2v1' || league.format === '2v2')) {
    const doubles = league.format === '2v2'
    return {
      title: doubles ? 'Waiting for a teammate' : 'Waiting for your size',
      detail: isOrganizer
        ? doubles
          ? 'Pair yourself with a teammate below.'
          : 'Give yourself a solo or allied size below.'
        : doubles
          ? `${league.ownerName} pairs players into teams.`
          : `${league.ownerName} decides who plays solo or allied.`,
      tone: 'waiting',
      steps: steps('assign'),
    }
  }
  const size = ownEntry.requiredLimit ? `${ownEntry.requiredLimit.toLocaleString()}-point ` : ''
  if (!ownEntry.submitted)
    return {
      title: revealed ? 'Seal another list' : `Seal your ${size}list`,
      detail: revealed ? 'The organizer unsealed your list.' : hidden,
      action: { label: 'Choose a list', icon: <FileLock2 />, onClick: choose },
      steps: steps('seal'),
    }
  // The pair's card is the one thing left to do before the reveal, so it leads the card until it is chosen.
  if (!revealed && ownEntry.team && ownEntry.team.choices.length > 1 && !ownEntry.team.disposition)
    return {
      title: 'Choose your team’s Force Disposition',
      detail: 'Your team plays one card. Choose it below before the lists are revealed.',
      tone: 'waiting',
      action: { label: 'Swap list', variant: 'outline', onClick: choose },
      steps: steps('reveal'),
    }
  if (!revealed)
    return {
      title: 'Your list is sealed',
      detail: hidden,
      tone: 'sealed',
      action: { label: 'Swap list', variant: 'outline', onClick: choose },
      steps: steps('reveal'),
    }
  if (!ownSideSealed)
    return { title: 'Waiting for your teammate', detail: 'They are sealing another list.', tone: 'waiting', steps: steps('seal') }
  return {
    title: latest ? 'The lists are out' : 'The lists are revealed',
    detail: playDetail,
    action: alone
      ? undefined
      : { label: startBattleLabel(leagueTableShape(league.format)), icon: <Swords />, pending: playing, onClick: play },
    steps: steps('play'),
  }
}

function EntryStatusCard({ status, problem, token }: { status: Status; problem: Error | null; token: string }) {
  const { action } = status
  const current = status.steps?.findIndex((step) => step.state === 'current') ?? -1
  return (
    <section
      data-onboarding="league-status"
      data-entry-status
      aria-labelledby="league-entry-status"
      className={`border bg-panel ${status.tone === 'sealed' ? 'border-achieved/50' : 'border-edge'}`}
    >
      <div className="space-y-3 p-4 sm:p-5">
        {status.steps && current >= 0 ? (
          <p className="eyebrow text-dim">
            Step {current + 1} of {status.steps.length}
          </p>
        ) : null}
        <div className="min-w-0">
          <h2
            id="league-entry-status"
            className={`flex items-center gap-2 text-xl leading-tight font-bold uppercase ${status.tone === 'sealed' ? 'text-achieved' : ''}`}
          >
            {status.tone === 'sealed' ? <ShieldCheck className="size-5 shrink-0" aria-hidden /> : null}
            <span className="min-w-0 break-words">{status.title}</span>
          </h2>
          {status.detail ? <p className="mt-1.5 text-sm text-dim">{status.detail}</p> : null}
        </div>
        {action ? (
          'to' in action ? (
            <Button
              size="lg"
              className="w-full pointer-coarse:h-11"
              nativeButton={false}
              variant={action.to === '/leagues' ? 'outline' : 'default'}
              render={action.to === '/sign-in' ? <Link to="/sign-in" search={{ next: `/leagues/${token}` }} /> : <Link to="/leagues" />}
            >
              {action.label}
            </Button>
          ) : (
            <Button
              size="lg"
              variant={action.variant ?? 'default'}
              className="w-full pointer-coarse:h-11"
              disabled={action.pending}
              onClick={action.onClick}
            >
              {action.icon} {action.label}
            </Button>
          )
        ) : null}
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(problem)}
          </p>
        ) : null}
      </div>
      {status.steps ? <EntryProgress steps={status.steps} /> : null}
    </section>
  )
}

/** The path through an event as a checklist beneath the card: what is done, what is now, and what is left. */
function EntryProgress({ steps }: { steps: EntryStep[] }) {
  return (
    <ol aria-label="Your progress" className="border-t border-edge bg-sunken/60 px-4 py-3 text-sm sm:px-5">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={`relative flex min-h-8 items-center gap-3 ${step.state === 'done' ? 'text-dim' : step.state === 'current' ? 'font-semibold text-bone' : 'text-faint'}`}
        >
          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className={`absolute top-[calc(50%+0.5rem)] left-2 h-[calc(100%-1rem)] w-px ${step.state === 'done' ? 'bg-achieved/50' : 'bg-edge'}`}
            />
          ) : null}
          <span
            aria-hidden
            className={`relative flex size-4 shrink-0 items-center justify-center rounded-full ${step.state === 'done' ? 'bg-achieved text-panel' : step.state === 'current' ? 'border-2 border-parchment bg-panel' : 'border border-edge-strong bg-panel'}`}
          >
            {step.state === 'done' ? <Check className="size-3" strokeWidth={3.5} /> : null}
          </span>
          <span className="min-w-0 flex-1">
            {step.label}
            {step.state === 'done' ? <span className="sr-only"> (done)</span> : null}
          </span>
          {step.state === 'current' ? <span className="text-2xs font-semibold tracking-label text-parchment uppercase">Now</span> : null}
        </li>
      ))}
    </ol>
  )
}
