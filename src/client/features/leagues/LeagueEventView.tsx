import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Eye, FileLock2, Pencil, ShieldCheck, Swords, TriangleAlert, UserPlus } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect, useState, type ReactNode } from 'react'
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
import { buttonClass } from '../../components/buttonClass'
import { GAME_SIZES, pointsSize } from '../../../core/battle'
import {
  isTeamFormat,
  leagueRegistrationFull,
  leagueEntryPoints,
  leagueRevealChecklist,
  leagueSealingClosed,
  leagueStage,
  leagueTableShape,
  mayRevealLeague,
  readsAlliedLeagueRoster,
  readsSealedLeagueRoster,
  type LeagueEntryView,
} from '../../../core/league'
import { createLeagueBattle, joinLeague, submitLeagueRoster } from '../../functions'
import { rosterWaivers, WaiverList } from '../../components/FormatWaivers'
import { entrantLabels } from '../../playerLabels'
import { battlesFrom, gameReferencesQuery, leagueBattlesQuery, leagueResultsQuery } from '../../queries'
import { BattleShelf } from '../battles/BattleShelf'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { DoublesBattleChooser, LeagueBattleChooser, OneOnOneBattleChooser, startBattleLabel } from './LeagueBattleChoosers'
import { EntrantGroup, EntrantList, EntrantRow, sealStatus, ViewRosterButton } from './LeagueEntrants'
import { SectionHeading } from '../../components/SectionHeading'
import {
  doublesTeams,
  entrantGroups,
  entryProgress,
  entryRules,
  eventName,
  leagueNextStep,
  leagueNoun,
  namesPhrase,
  organizerName,
  useLeagueRefresh,
  type EntryStage,
  type EntryStep,
  type League,
} from './leagueEvent'
import { InvitePanel, OrganizerEntrants } from './LeagueOrganizer'
import { LeagueArmies } from './LeagueArmies'
import { LeagueReadiness, RevealRostersDialog } from './LeagueReadiness'
import { LeagueBattleSkeleton, RosterChooser } from './LeagueRosterChooser'
import { LeagueCombatDialog } from './LeagueCombatDialog'
import { LeagueResults } from './LeagueResults'
import { useMoment } from './EventSchedule'
import { useNow } from '../../useNow'
import { forfeited, LeagueRounds, ownTable, swissProgress } from './LeagueRounds'
import { TeamDispositionPanel } from './LeagueTeamDisposition'
import { TeamWarlordPanel } from './LeagueTeamWarlord'
import { LeagueRosterSharing } from './LeagueRosterSharing'
import { Problem } from '../../components/Problem'
import { formatList } from '../../text'
import { useStartBattle } from '../battles/useStartBattle'

type ClickAction = {
  label: string
  icon?: ReactNode
  variant?: 'default' | 'outline'
  pending?: boolean
  /** Marks the reveal, which the league guide points at. */
  reveal?: true
  onClick: () => void
}
type Action = ClickAction | { label: string; to: '/sign-in' | '/tournaments' }

type Status = {
  title: string
  detail?: string
  sealed?: true
  action?: Action
  /** A quieter second press, kept when the reveal takes over the card's action. */
  secondary?: ClickAction
  steps?: EntryStep[]
}

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
  const { defaultMissionPackId, openBattle } = useStartBattle()
  const refresh = useLeagueRefresh(token)
  const revealed = Boolean(league.revealedAt)
  const battleHistory = useInfiniteQuery({ ...leagueBattlesQuery(token, league.eventToken), enabled: revealed })
  const { data: results } = useQuery({ ...leagueResultsQuery(token, league.eventToken), enabled: revealed })
  const { data: gameReferences } = useQuery(gameReferencesQuery())
  const moment = useMoment()
  const now = useNow(league.sealBy)
  const [choosing, setChoosing] = useState(Boolean(chooseRoster))
  const [sealing, setSealing] = useState<SavedRoster | null>(null)
  const [choosingBattle, setChoosingBattle] = useState(Boolean(startBattle))
  const [simulating, setSimulating] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
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
  const battleFormat = leagueTableShape(league.format)
  const battle = useMutation({
    onMutate: () => posthog.capture('battle_creation_submitted', { format: battleFormat, source: 'league' }),
    onError: () => posthog.capture('battle_creation_failed', { format: battleFormat, reason: 'request', source: 'league' }),
    mutationFn: async (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) =>
      createLeagueBattle({
        data: { token, eventToken: league.eventToken, ...players, missionPackId: await defaultMissionPackId() },
      }),
    onSuccess: ({ token: battleToken }) => openBattle(battleToken),
  })
  // Counted when the chooser appears, whether the page or a casual battle's league prompt opened it.
  useEffect(() => {
    if (choosingBattle) posthog.capture('battle_creation_started', { source: 'league' })
  }, [choosingBattle])
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

  const eventBattles = battlesFrom(battleHistory.data)
  const ownEntry = viewerId ? league.entries.find((entry) => entry.userId === viewerId) : undefined
  const seatPoints = ownEntry ? leagueEntryPoints(league, ownEntry) : null
  const entryStatusNow = ownEntry?.status
  // A duel needs nothing from the organizer before a roster, so a new entrant's next step opens straight away.
  const duel = !isTeamFormat(league.format)
  if (chooseOnEntry && entryStatusNow === 'accepted') {
    setChooseOnEntry(false)
    if (duel && !revealed) setChoosing(true)
  }
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const sealedEntrants = accepted.filter((entry) => entry.submitted)
  const labels = entrantLabels(league.entries)
  const label = (entry: LeagueEntryView) => labels.get(entry.userId) ?? entry.name
  const ownTeam = ownEntry?.teamId ? (doublesTeams(accepted).find((team) => team.id === ownEntry.teamId)?.members ?? []) : []
  const ownSideSealed =
    league.format === '2v2' || ownEntry?.teamId ? ownTeam.length === 2 && ownTeam.every((entry) => entry.submitted) : true
  // A legacy event fixed no size, so a 1v1 there is only between rosters sealed at the same one.
  const oneOnOneEntrants =
    league.format === null
      ? sealedEntrants.filter(
          (entry) =>
            typeof ownEntry?.sealedLimit === 'number' &&
            GAME_SIZES.some((size) => size.limit === ownEntry.sealedLimit) &&
            entry.sealedLimit === ownEntry.sealedLimit,
        )
      : sealedEntrants
  const readsRoster = (entry: LeagueEntryView) =>
    entry.submitted && readsSealedLeagueRoster(league.format, league.rosterLimit, ownEntry ?? null, entry)
  const allies =
    ownEntry && !revealed ? accepted.filter((entry) => readsAlliedLeagueRoster(league.format, league.rosterLimit, entry, ownEntry)) : []
  const swiss = league.rounds !== null
  const table = swiss ? ownTable(league, viewerId) : undefined
  const swissProgressNow = swissProgress(league, eventBattles)
  const tableOpponent = table ? (table.aId === viewerId ? table.bId : table.aId) : null
  const tableForfeited = Boolean(table && !table.battleToken && forfeited(table, league.entries))
  // In Swiss rounds the only battle to start is the viewer's own unplayed table, unless a player there has dropped.
  const swissOpponent = table && !table.battleToken && !tableForfeited ? tableOpponent : null
  const met = new Set(results?.met.flatMap(([one, other]) => (one === viewerId ? [other] : other === viewerId ? [one] : [])))
  const opponents = oneOnOneEntrants.filter((entry) => entry.userId !== viewerId)
  const yetToPlay = opponents.filter((entry) => !met.has(entry.userId)).map(label)
  // A duel entrant hears who is left to play; a blank line holds its height while results load, so the page does not jump.
  const playDetail =
    battleFormat !== '1v1' || !ownEntry?.submitted || !revealed
      ? undefined
      : swiss
        ? swissDetail(table, ownEntry.dropped, tableForfeited, swissProgressNow, () => {
            const entry = league.entries.find((candidate) => candidate.userId === tableOpponent)
            return entry ? label(entry) : 'your opponent'
          })
        : !opponents.length
          ? 'Nobody else joined.'
          : !results
            ? '\u00a0'
            : yetToPlay.length
              ? `Still to play: ${namesPhrase(yetToPlay)}.`
              : 'You have played everyone. Rematches count too.'
  const alone = swiss ? !swissOpponent : battleFormat === '1v1' && !opponents.length
  const registrationFull = leagueRegistrationFull(entryRules(league), accepted.length, league.occupiedCount)
  const entryCard = entryStatus({
    league,
    ownEntry,
    signedIn: viewerId !== null,
    isOrganizer,
    registrationFull,
    ownSideSealed,
    allies: allies.map(label),
    playDetail,
    alone,
    join: () => join.mutate(),
    joining: join.isPending,
    choose: openRosterChooser,
    play: swissOpponent ? () => battle.mutate({ opponentId: swissOpponent }) : openBattleChooser,
    playLabel: swissOpponent ? `Start your round ${swissProgressNow.round} battle` : undefined,
    sealingClosed: leagueSealingClosed(league, now),
    sealBy: league.sealBy === null ? null : moment(league.sealBy),
    playing: battle.isPending,
  })
  // Once every check passes, opening the rosters is the event's next step for anyone who may, so it leads their card.
  const revealReady =
    !revealed &&
    mayRevealLeague(isOrganizer, ownEntry ?? null) &&
    leagueRevealChecklist(league, league.entries, now).every((check) => check.done)
  const status: Status = revealReady
    ? {
        ...entryCard,
        action: { label: 'Reveal all rosters', icon: <Eye />, reveal: true, onClick: () => setRevealing(true) },
        secondary: entryCard.action && !('to' in entryCard.action) ? entryCard.action : undefined,
      }
    : entryCard
  const problem = join.error ?? (duel ? battle.error : null)
  const sealWaivers = sealing ? rosterWaivers(sealing) : []
  // Before the reveal a row offers only your own or an ally's roster; once the rosters are out, the cards carry every one.
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
    // Waits for the references rather than flashing the card's id.
    const named = card && gameReferences ? (gameReferences.dispositions.find((disposition) => disposition.id === card)?.name ?? card) : null
    return [formatList(members.map(label)), named && `plays ${named}`].filter(Boolean).join(' · ')
  }
  // The revealed rosters split by side or pair the way the entrant list does, so a pairing reads the same before and after.
  const groups = entrantGroups(league, accepted, pairNames)
  // Once the rosters are out, each player shows with their roster, so the entrant list has nothing left to say.
  const entrants = revealed ? null : isOrganizer ? (
    <OrganizerEntrants league={league} token={token} row={row} />
  ) : (
    <section>
      <SectionHeading title="Entrants" count={accepted.length} />
      {!accepted.length ? (
        <p className="text-sm text-dim">No entrants yet. Players show up here once they’re in.</p>
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
  // Whoever moves the event on, the organizer or a player in it, reads its next step.
  // In Swiss rounds the status card and the rounds say what comes next, round by round.
  const nextStep =
    !(swiss && revealed) && (isOrganizer || ownEntry?.status === 'accepted')
      ? leagueNextStep(
          leagueStage(league, league.entries, Boolean(results?.rows.some((result) => result.played)), now),
          // The same facts that give the status card its start-battle action.
          { organizer: isOrganizer, canPlay: Boolean(ownEntry?.submitted) && ownSideSealed && !alone },
          league,
        )
      : null
  const aside = isOrganizer ? <aside className="space-y-3">{!revealed ? <InvitePanel league={league} /> : null}</aside> : null

  return (
    <>
      {simulating && revealed && ownEntry?.submitted && viewerId ? (
        <LeagueCombatDialog
          token={token}
          eventToken={league.eventToken}
          viewerId={viewerId}
          opponentId={simulating}
          entries={sealedEntrants.map((entry) => ({
            userId: entry.userId,
            label: label(entry),
            owner: { name: label(entry), image: entry.image },
          }))}
          teams={groups.flatMap((group) =>
            group.teamId && group.entries.length > 1 && group.entries.every((entry) => sealedEntrants.includes(entry))
              ? [
                  {
                    id: `team:${group.teamId}`,
                    label: `${group.title}: ${formatList(group.entries.map(label))}`,
                    userIds: group.entries.map((entry) => entry.userId),
                  },
                ]
              : [],
          )}
          onClose={() => setSimulating(null)}
        />
      ) : null}
      <div>
        {revealed && viewerId && ownEntry?.status === 'accepted' && ownEntry.submitted ? (
          <LeagueRosterSharing key={league.eventToken} token={token} eventToken={league.eventToken} userId={viewerId} />
        ) : null}
      </div>
      {/* The reader's own next step leads the side column, and a phone, where it comes first. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-2 lg:row-start-1">
          <EntryStatusCard status={status} problem={problem} token={token} />
          {!revealed && ownEntry?.team && ownEntry.team.choices.length > 1 ? (
            <div className="mt-3">
              <TeamDispositionPanel token={token} eventToken={league.eventToken} team={ownEntry.team} />
            </div>
          ) : null}
          {!revealed && viewerId && ownEntry?.team && ownEntry.team.warlordChoices.length > 1 ? (
            <div className="mt-3">
              <TeamWarlordPanel
                token={token}
                eventToken={league.eventToken}
                viewerId={viewerId}
                team={ownEntry.team}
                nameOf={(userId) => {
                  const entry = league.entries.find((candidate) => candidate.userId === userId)
                  return entry ? label(entry) : 'Your teammate'
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {nextStep ? (
            <p data-league-next-step className="flex items-start gap-2 text-sm text-dim">
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-parchment" aria-hidden />
              <span>
                <span className="font-semibold text-bone">Next: </span>
                {nextStep}
              </span>
            </p>
          ) : null}
          {!revealed && (isOrganizer || accepted.length) ? (
            <LeagueReadiness token={token} league={league} viewerId={viewerId} isOrganizer={isOrganizer} label={label} />
          ) : null}
          {revealed ? (
            <LeagueArmies
              token={token}
              eventToken={league.eventToken}
              groups={groups}
              viewerId={viewerId}
              revealedBy={league.revealedByName}
              label={label}
              canUnseal={isOrganizer}
              dropBy={!swiss ? null : isOrganizer ? 'organizer' : ownEntry?.status === 'accepted' ? 'player' : null}
              onSimulate={ownEntry?.status === 'accepted' && ownEntry.submitted ? setSimulating : null}
            />
          ) : null}
          {revealed && swiss ? (
            <LeagueRounds
              league={league}
              token={token}
              battles={eventBattles}
              viewerId={viewerId}
              isOrganizer={isOrganizer}
              entries={league.entries}
              label={label}
              onPlay={(opponentId) => battle.mutate({ opponentId })}
              playing={battle.isPending}
            />
          ) : null}
          {revealed ? (
            <section>
              {eventBattles.length || !battleHistory.isPending ? <SectionHeading title="Battles" count={eventBattles.length} /> : null}
              {eventBattles.length ? (
                <>
                  <BattleShelf name="Battles" battles={eventBattles} viewerId={viewerId ?? undefined} />
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
                <p className="text-sm text-dim">No battles yet. Battles started from this page show up here.</p>
              )}
            </section>
          ) : null}
          {results?.swiss && league.pairings.length ? (
            <LeagueResults
              event={eventName(league)}
              rows={results.swiss}
              swiss
              partial={results.partial}
              entries={accepted}
              label={label}
            />
          ) : results?.rows.some((result) => result.played) ? (
            <LeagueResults event={eventName(league)} rows={results.rows} partial={results.partial} entries={accepted} label={label} />
          ) : null}
          {entrants}
        </div>
        <div className="lg:col-start-2">{aside}</div>
      </div>

      {revealReady ? <RevealRostersDialog league={league} token={token} open={revealing} onOpenChange={setRevealing} /> : null}
      <RosterChooser
        open={choosing}
        pending={submit.isPending}
        error={submit.error}
        failedRosterId={submit.variables ?? null}
        requiredLimit={seatPoints === null ? (ownEntry?.requiredLimit ?? null) : league.rosterLimit}
        pointsBudget={league.pointsBudget}
        seatPoints={seatPoints}
        onClose={() => {
          if (submit.isPending) return
          submit.reset()
          setChoosing(false)
        }}
        onChoose={(roster) => {
          submit.reset()
          // An event that records its allowances answers for every waiver itself: it seals the allowed ones and refuses the rest.
          if (league.allowances === null && rosterWaivers(roster).length) setSealing(roster)
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
            Praetorium has not checked {sealWaivers.length === 1 ? 'it' : 'them'}, so this roster may not be legal here. The organizer and
            every opponent see what it waives at reveal.
          </p>
          <AlertDialogFooter className="sm:flex-wrap">
            {sealing ? (
              <Link
                to="/rosters/$id"
                params={{ id: sealing.id }}
                data-slot="button"
                className={buttonClass({ variant: 'outline', className: 'sm:mr-auto' })}
              >
                <Pencil /> Edit roster
              </Link>
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
  join,
  joining,
  choose,
  play,
  playLabel,
  sealingClosed,
  sealBy,
  playing,
}: {
  league: League
  ownEntry: League['entries'][number] | undefined
  signedIn: boolean
  isOrganizer: boolean
  registrationFull: boolean
  ownSideSealed: boolean
  allies: string[]
  /** Who a duel entrant has left to play, once the rosters are out. */
  playDetail: string | undefined
  /** A duel with nobody else in it, where there is no battle to start. */
  alone: boolean
  join: () => void
  joining: boolean
  choose: () => void
  play: () => void
  /** What the play action says when it starts one battle in particular, such as a Swiss table. */
  playLabel?: string
  /** Whether the roster deadline has passed, and when it falls, read in the viewer's timezone. */
  sealingClosed: boolean
  sealBy: string | null
  playing: boolean
}): Status {
  const steps = (stage: EntryStage) => entryProgress(league, stage)
  const { noun } = leagueNoun(league)
  const revealed = Boolean(league.revealedAt)
  const hidden = allies.length
    ? `Only ${allies.length > 2 ? `${allies.length} allies` : formatList(allies)} can see it before the reveal.`
    : 'Hidden until the reveal.'
  if (!ownEntry || ownEntry.status !== 'accepted') {
    if (revealed && isOrganizer) return { title: 'The rosters are out', detail: `You run this ${noun} without a roster of your own.` }
    if (revealed)
      return {
        title: 'The rosters are out',
        detail: `Everyone here sealed a roster in secret, the rosters opened together, and now they play each other. ${organizerName(league)} runs it.`,
        action: signedIn && !league.club ? { label: 'Start your own tournament', to: '/tournaments' } : undefined,
      }
    if (!signedIn) return { title: 'Registration is open', action: { label: 'Sign in to join', to: '/sign-in' }, steps: steps('join') }
    if (ownEntry?.status === 'pending')
      return { title: 'Waiting for approval', detail: `${organizerName(league)} will let you in.`, steps: steps('join') }
    if (sealingClosed) return { title: 'Entry has closed', detail: 'The roster deadline has passed.' }
    const rejoin = ownEntry?.status === 'rejected'
    if (registrationFull) return { title: rejoin ? `You are not in this ${noun}` : `This ${noun} is full` }
    if (isOrganizer && !rejoin)
      return {
        title: 'You are not playing',
        detail: `You run this ${noun} without a roster of your own.`,
        action: { label: 'Join as a player', icon: <UserPlus />, variant: 'outline', pending: joining, onClick: join },
      }
    return {
      title: rejoin ? `You are not in this ${noun}` : `Join this ${noun}`,
      detail: rejoin
        ? 'Your request was turned down.'
        : league.tournament?.admission === 'approval'
          ? `${league.tournament.ownerName} approves each player.`
          : undefined,
      action: { label: rejoin ? 'Request to join again' : `Join ${noun}`, icon: <UserPlus />, pending: joining, onClick: join },
      steps: steps('join'),
    }
  }
  if (!revealed && ownEntry.requiredLimit === null && isTeamFormat(league.format)) {
    const doubles = league.format === '2v2'
    return {
      title: doubles ? 'Waiting for a teammate' : 'Waiting for your size',
      detail: isOrganizer
        ? doubles
          ? 'Pair yourself with a teammate below.'
          : 'Give yourself a solo or allied size below.'
        : doubles
          ? `${organizerName(league)} pairs players into teams.`
          : `${organizerName(league)} decides who plays solo or allied.`,
      steps: steps('assign'),
    }
  }
  const points = leagueEntryPoints(league, ownEntry) ?? ownEntry.requiredLimit
  const size = points ? `${pointsSize(points)} ` : ''
  if (!revealed && !ownEntry.submitted && sealingClosed)
    return {
      title: 'The roster deadline has passed',
      detail: 'Nobody can seal now, so you sit this one out.',
      steps: steps('seal'),
    }
  if (!ownEntry.submitted)
    return {
      title: revealed ? 'Seal another roster' : `Seal your ${size}roster`,
      detail: revealed ? 'The organizer unsealed your roster.' : [hidden, sealBy ? `Seal by ${sealBy}.` : null].filter(Boolean).join(' '),
      action: { label: 'Choose a roster', icon: <FileLock2 />, onClick: choose },
      steps: steps('seal'),
    }
  // The pair's card is the one thing left to do before the reveal, so it leads the card until it is chosen.
  if (!revealed && ownEntry.team && ownEntry.team.choices.length > 1 && !ownEntry.team.disposition)
    return {
      title: 'Choose your team’s Force Disposition',
      detail: 'Your team plays one card. Choose it below before the rosters are revealed.',
      action: { label: 'Swap roster', variant: 'outline', onClick: choose },
      steps: steps('reveal'),
    }
  if (!revealed && ownEntry.team && ownEntry.team.warlordChoices.length > 1 && !ownEntry.team.warlord)
    return {
      title: 'Choose your team’s Warlord',
      detail: 'Each roster names its own Warlord and your team fields one. Choose whose below before the rosters are revealed.',
      action: { label: 'Swap roster', variant: 'outline', onClick: choose },
      steps: steps('reveal'),
    }
  if (!revealed)
    return {
      title: 'Your roster is sealed',
      detail: hidden,
      sealed: true,
      action: { label: 'Swap roster', variant: 'outline', onClick: choose },
      steps: steps('reveal'),
    }
  if (!ownSideSealed) return { title: 'Waiting for your teammate', detail: 'They are sealing another roster.', steps: steps('seal') }
  return {
    title: 'The rosters are out',
    detail: playDetail,
    action: alone
      ? undefined
      : { label: playLabel ?? startBattleLabel(leagueTableShape(league.format)), icon: <Swords />, pending: playing, onClick: play },
    // A player who dropped has nothing left to play, so no step stays current.
    steps: ownEntry.dropped ? steps('play').map((step) => ({ ...step, state: 'done' as const })) : steps('play'),
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
      className={`border bg-panel ${status.sealed ? 'border-achieved/50' : 'border-edge'}`}
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
            className={`flex items-center gap-2 text-xl leading-tight font-bold uppercase ${status.sealed ? 'text-achieved' : ''}`}
          >
            {status.sealed ? <ShieldCheck className="size-5 shrink-0" aria-hidden /> : null}
            <span className="min-w-0 break-words">{status.title}</span>
          </h2>
          {status.detail ? <p className="mt-1.5 text-sm text-dim">{status.detail}</p> : null}
        </div>
        {action ? (
          'to' in action ? (
            <Link
              {...(action.to === '/sign-in' ? { to: '/sign-in', search: { next: `/tournaments/${token}` } } : { to: '/tournaments' })}
              className={buttonClass({
                size: 'lg',
                variant: action.to === '/tournaments' ? 'outline' : 'default',
                className: 'w-full pointer-coarse:h-11',
              })}
            >
              {action.label}
            </Link>
          ) : (
            <Button
              data-onboarding={action.reveal ? 'league-reveal' : undefined}
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
        {status.secondary ? (
          <Button
            variant="outline"
            className="w-full pointer-coarse:h-11"
            disabled={status.secondary.pending}
            onClick={status.secondary.onClick}
          >
            {status.secondary.icon} {status.secondary.label}
          </Button>
        ) : null}
        {problem ? <Problem error={problem} /> : null}
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
            {step.state === 'done' ? <Check className="size-3" /> : null}
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

/** What a Swiss entrant does next: play their table, wait out their bye, or wait for the round. */
function swissDetail(
  table: ReturnType<typeof ownTable>,
  dropped: boolean,
  forfeit: boolean,
  progress: ReturnType<typeof swissProgress>,
  opponent: () => string,
) {
  if (dropped) return 'You’re out of the Swiss rounds. Your results stay in the table.'
  if (!progress.round) return 'Waiting for the organizer to pair round 1.'
  if (!table) return `Round ${progress.round} is under way.`
  if (!table.bId) return `You have a bye in round ${progress.round}: it counts as a win.`
  if (forfeit) return `${opponent()} dropped out, so round ${progress.round} counts as a bye for you.`
  if (!table.battleToken) return `Round ${progress.round}: you play ${opponent()}.`
  return progress.complete
    ? progress.round < progress.rounds
      ? `Waiting for the organizer to pair round ${progress.round + 1}.`
      : 'Every round is played.'
    : `Round ${progress.round} is under way.`
}
