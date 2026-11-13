import { SideNames } from '../PlayerName'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { BattleView } from '../../../../core/battleView'
import {
  armyPointsFor,
  sharedSidePoints,
  battlePointsBudget,
  openPlaces,
  stillFilling,
  battleSizeLabel,
  battleSizeOptionLabel,
  battleSizeText,
  battleSizeTitle,
  GAME_SIZES,
  isKotcLimit,
  pointsBudgetsAgree,
  rosterBattleFormat,
  pointsLabel,
  teamArmyProblems,
  shortSides,
  battleCapacity,
} from '../../../../core/battle'
import { battleCommandsSettled } from '../../../pendingWrites'
import { battleGroupsQuery, battleQuery, deploymentsQuery, gameReferencesQuery } from '../../../queries'
import { fixedHandShort, missionCardsReady, type Side, type SideMission, sideName, sideOf, sides as foldSides } from '../../../sides'
import type { RosterAttachment, SendCommand } from '../useCommand'
import { advanceOnboarding } from '../../onboarding/onboarding'
import { Battlefield } from './Battlefield'
import { ArmyChooser } from './ArmiesStep'
import { FaceOff } from './FaceOff'
import {
  OpponentStep,
  playsEverySide,
  refreshTable,
  RemovePlayerDialog,
  useDraft,
  useInvitePlayersInstead,
  usePlayEverySide,
  useShareBattle,
} from './OpponentStep'
import { isPracticeSeat } from '../../../../core/newBattle'
import { removeBattlePlayer } from '../../../functions'
import { useHistoryDialog } from '../../../useHistoryDialog'
import { landOn, SideFocusProvider, useDispositionNames } from './chrome'
import { DefenderStep } from './DefenderStep'
import { FirstTurnStep } from './FirstTurnStep'
import { DeployUnits, PrebattleUnits } from './PrebattleUnits'
import { ReservesStep } from './ReservesStep'
import { SecondariesStep } from './SecondariesStep'
import { MissionDetailsDialog, type MissionDetails } from '../MissionCards'
import { useSpectated } from '../Spectator'
import { BattleCombatDialog, type BattleCombatSelection } from '../../simulator/BattleCombatDialog'
import { tint } from '../battleTints'
import { Problem } from '../../../components/Problem'
import { formatList } from '../../../text'
import { deploymentFor } from '../../../battleSummary'
import { MissionAnswer, PrebattleAnswer, ReservesAnswer, SecondariesAnswer } from './answers'
import { FormatStep } from './FormatStep'
import { MissionStep } from './MissionStep'
import { SECTION_IDS, type Configure, type SectionId } from './sections'
import { SetupBar } from './SetupBar'
import { SetupHeader } from './SetupHeader'
import { SpineStep } from './SpineStep'

type Props = {
  view: BattleView
  mission: { id: string; name: string; deploymentIds: string[] } | null
  /** Every side's matchup, so a side the table plays settles its cards from its own. */
  missions: { side: number; mission: SideMission | null }[]
  /** Absent for a reader with no seat, who follows the table's answers without the controls. */
  send?: SendCommand
  attachRoster?: (command: RosterAttachment) => Promise<boolean>
  pending?: boolean
  problem?: string | null
}

/**
 * The two dispositions a set of layouts is for, in the order the table reads them.
 *
 * Named rather than sloganeered: a player choosing a battlefield is choosing one for
 * this matchup, and the pack prints the layouts under exactly that heading.
 */
function matchupName(table: Side[], nameDisposition: (id: string | null | undefined) => { name: string } | null) {
  const named = table.map((side) => nameDisposition(side.disposition)?.name)
  return named.length === 2 && named.every(Boolean) ? named.join(' vs ') : undefined
}

/** How often setup asks whether someone has joined an open place. */
const JOIN_POLL_MS = 3_000
const BUDGET_MISMATCH = 'Choose rosters with the same points budget for each side.'
/** The steps a manually tracked battle does not play. */
const MANUAL_SKIPS = new Set<SectionId>(['mission', 'battlefield', 'defender', 'secondaries', 'reserves', 'deploy', 'pre-battle'])
/** Steps that record nothing the battle needs before it can begin. */
const NOTHING_OWED = new Set<SectionId>(['reserves', 'deploy', 'pre-battle'])

/**
 * Setting the table on one page, in the order the rules set it.
 *
 * Every answer is folded from the battle log, so both devices read the same page and
 * the same list of what is left; where each device is scrolled is its own.
 */
export function Setup({ view, mission, missions, send: sendCommand, attachRoster, pending = false, problem = null }: Props) {
  const watching = !sendCommand
  const table = foldSides(view, missions)
  useSpectated(view, table)
  const manual = view.settings.manual === true
  const skipped = (id: SectionId) => manual && MANUAL_SKIPS.has(id)
  const yours = table.find((side) => side.isViewer)
  const { data: references } = useQuery(gameReferencesQuery())
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: groups } = useQuery(battleGroupsQuery(view.token))
  const nameDisposition = useDispositionNames()
  const attacker = sideOf(table, view.attackerId)
  const defender = attacker ? table.find((side) => side.index !== attacker.index) : undefined
  // Pre-battle rules resolve starting with whoever takes the first turn, so it is read
  // from the log rather than from the device that recorded the roll-off.
  const firstSide = sideOf(table, view.firstPlayerId)
  /** The reserve row whose move the latest refusal answers, which says it beside the row rather than in the bar. */
  const [reserveRow, setReserveRow] = useState<string | null>(null)
  // Any other command the player sends takes the latest refusal back to the bar.
  const send: SendCommand = (command, options) => {
    if (!options?.background) setReserveRow(null)
    sendCommand?.(command, options)
  }
  /** The unit a reader with no seat asked to simulate from an army's list. */
  const [combatSelection, setCombatSelection] = useState<BattleCombatSelection | null>(null)
  /** The mission card a matchup panel has been asked to read out, if any. */
  const [reading, setReading] = useState<MissionDetails | null>(null)
  // The chooser opens over the page from an army's card.
  const [, chooseRoster] = useHistoryDialog('choose-roster')
  // A draft is listed once its table fills, and joining or leaving changes who sees its link, so either reads it again.
  const { data: draft } = useDraft(view.token, `${stillFilling(view)}:${view.players.length}`)
  const shareLink = useShareBattle(view.token)
  const places = view.settings.places
  /** The side a phone shows in steps that list both, starting on the viewer's own. */
  const [focusedSide, setFocusedSide] = useState<number | null>(null)
  const open = openPlaces(view)
  const openCount = open[0] + open[1]
  const attached = view.players.filter((player) => player.roster).length
  // Every army, which a place nobody has joined yet still owes.
  const ready = attached === view.players.length && openCount === 0
  const queryClient = useQueryClient()
  // Joining adds no command, so the battle's live signal doesn't carry it; the page asks again while a place is open.
  useEffect(() => {
    if (watching || !openCount) return
    // Skipped while this device is sending, so the answer it is waiting for isn't replaced by an older read.
    const timer = setInterval(() => {
      if (!battleCommandsSettled(view.token)) void queryClient.invalidateQueries({ queryKey: battleQuery(view.token).queryKey })
    }, JOIN_POLL_MS)
    return () => clearInterval(timer)
  }, [watching, openCount, queryClient, view.token])
  const format = rosterBattleFormat(view)
  const youHaveAnArmy = Boolean(yours?.armies.find((army) => army.isViewer)?.roster)
  /** Your own army while it has no list, which the bar offers to choose before anything else it can do. */
  const yourArmy = view.sealedEventToken ? undefined : yours?.armies.find((army) => army.isViewer && !army.roster)
  // A place the viewer plays brings nothing on its own, so its list is one of the ones this table still owes.
  const owed = table.flatMap((side) => side.armies).filter((army) => (army.isViewer || army.automated) && !army.roster)
  const awaited = table.flatMap((side) => side.armies).filter((army) => !army.isViewer && !army.automated && !army.roster)
  const undecided = table.filter((side) => side.dispositionChoices.length > 1 && !side.disposition)
  const leaderless = table.filter((side) => side.warlordChoices.length > 1 && !side.warlord)
  const missingCards = table.filter((side) => !missionCardsReady(side))
  const kotc = isKotcLimit(view.settings.limit)
  const pointsBudget = battlePointsBudget(view)
  /*
   * Every seated device writes the cards the armies settle as soon as they are in. A
   * shared answer pressed in that moment would race those writes and come back stale,
   * so the table's own choices wait the second it takes.
   */
  const recording = ready && missingCards.some((side) => !fixedHandShort(side))
  const busy = pending || recording

  const team = view.settings.teamBattle
  const twoVsOne = battleCapacity(view.settings) === 3
  const budgetsDiffer = ready && !team && !view.settings.sizeFromSides && !pointsBudgetsAgree(view)
  const short = shortSides(view)[0]
  const armyProblem = ready ? teamArmyProblems(view)[0] : undefined
  /** Said on the card of the side it belongs to. */
  const armyProblemText = armyProblem
    ? armyProblem.code === 'allies-mismatch'
      ? 'Choose lists saved to the same points total.'
      : sharedSidePoints(view, armyProblem.side) !== null
        ? `Allies spend more than their ${pointsLabel(sharedSidePoints(view, armyProblem.side)!)}.`
        : `An army spends more than its ${pointsLabel(armyPointsFor(view, armyProblem.side)!)}.`
    : undefined
  const sizeProblem =
    view.settings.limit !== null
      ? budgetsDiffer
        ? BUDGET_MISMATCH
        : null
      : !ready
        ? null
        : view.settings.sizeFromRosters
          ? format.problem === 'manual'
            ? 'Choose a battle size for text-only armies.'
            : format.problem === 'unsupported'
              ? view.settings.sizeFromSides
                ? `A side’s lists add up past the biggest battle size, ${pointsLabel(GAME_SIZES.at(-1)!.limit)}. Choose smaller lists.`
                : 'These roster formats do not make a supported battle size. Choose another format; allies split the points evenly.'
              : format.problem === 'budget-mismatch'
                ? BUDGET_MISMATCH
                : 'Choose matching roster formats for each side.'
          : 'Choose a battle size to continue.'

  /**
   * Everything the battle still needs before it can begin, in rules order. The summary
   * beside Start battle and the button itself both read this one list.
   */
  const remaining = [
    ...(openCount ? [openCount > 1 ? `${openCount} players` : view.players.some((player) => open[player.side]) ? 'Ally' : 'Opponent'] : []),
    ...owed.map((army) => (army.isViewer ? 'Your army' : `${army.playerName}’s army`)),
    ...awaited.map((army) => `${army.playerName}’s army`),
    ...(ready && view.settings.limit === null ? ['Battle size'] : []),
    ...(view.settings.limit !== null && (budgetsDiffer || armyProblem) ? ['Points budget'] : []),
    ...(leaderless.length ? ['Warlord'] : []),
    ...(manual
      ? []
      : [
          ...(undecided.length ? ['Force Disposition'] : []),
          ...(view.deploymentId ? [] : ['Battlefield']),
          ...(view.attackerId ? [] : ['Defender']),
          ...(ready
            ? [...new Set(missingCards.map((side) => (fixedHandShort(side) ? `${sideName(side)} secondaries` : 'Mission cards')))]
            : []),
        ]),
    ...(view.firstPlayerId ? [] : ['First turn']),
  ]

  useEffect(() => {
    if (ready && !watching) advanceOnboarding('battle', 'battle-setup-size', 'battle-setup-mission')
  }, [ready, watching])
  useEffect(() => {
    if (view.deploymentId && !watching) advanceOnboarding('battle', 'battle-setup-battlefield', 'battle-setup-defender')
  }, [view.deploymentId, watching])
  useEffect(() => {
    if (view.attackerId && !watching) advanceOnboarding('battle', 'battle-setup-defender', 'battle-setup-secondaries')
  }, [view.attackerId, watching])
  useEffect(() => {
    if (view.firstPlayerId && !watching) advanceOnboarding('battle', 'battle-setup-first', 'battle-setup-begin')
  }, [view.firstPlayerId, watching])

  // A twist belongs to the pack that prints it, so changing the pack drops it above.
  const chosenPack = references?.packs.find((pack) => pack.id === view.settings.missionPackId)
  const twists = chosenPack?.twists ?? []
  const twist = twists.find((entry) => entry.id === view.settings.twistId)
  /**
   * What a primary actually asks for, so the matchup can be read rather than only
   * named. Taken from the pack in play, or from wherever else it is printed for a
   * battle opened before a pack was settled.
   */
  const primaryCardFor = (missionId: string) =>
    (chosenPack ?? { missions: references?.packs.flatMap((pack) => pack.missions) ?? [] }).missions.find((entry) => entry.id === missionId)
      ?.card ?? undefined

  const configure: Configure = (settings, then) =>
    send(
      {
        kind: 'configure-battle',
        limit: view.settings.sizeFromRosters ? null : view.settings.limit,
        missionPackId: view.settings.missionPackId,
        terrainLayoutId: view.settings.terrainLayoutId,
        twistId: view.settings.twistId,
        teamBattle: view.settings.teamBattle,
        playerCount: view.settings.playerCount,
        // A 2v1 pair shares the battle size, so an older battle's points per army go once the table changes its format.
        armyPoints: twoVsOne && !view.sealedEventToken ? null : (view.settings.armyPoints ?? null),
        ...(view.settings.sharedArmyPoints ? { sharedArmyPoints: true } : {}),
        sizeFromSides: true,
        clockLimitMinutes: null,
        ...(manual ? { manual: true } : {}),
        ...settings,
      },
      then ? { complete: (appended) => appended && then() } : undefined,
    )

  const sizeFixed = Boolean(view.sealedEventToken || (view.settings.sizeFromRosters && format.problem !== 'manual'))
  // A size taken from the rosters is only known once every list is in, which the next step asks for.
  const sizeAwaited = view.settings.limit === null && Boolean(view.settings.sizeFromRosters)
  const sizeName =
    view.settings.limit === null
      ? sizeAwaited
        ? 'After the armies'
        : 'Not chosen yet'
      : team
        ? battleSizeText(view)!
        : pointsBudget === null
          ? battleSizeOptionLabel({
              name: battleSizeTitle(view.settings.limit),
              limit: view.settings.limit,
            })
          : battleSizeLabel(view.settings.limit, pointsBudget)
  const checked = (id: SectionId) => (view.setupChecked ?? []).includes(SECTION_IDS.indexOf(id))
  const armiesIn = view.settings.limit !== null && ready && !budgetsDiffer && !armyProblem && !leaderless.length
  const complete: Record<SectionId, boolean> = {
    format: (view.settings.limit !== null || sizeFixed) && (manual || Boolean(chosenPack)),
    opponent: openCount === 0,
    mission: Boolean(mission) && !undecided.length,
    battlefield: Boolean(view.deploymentId),
    defender: Boolean(view.attackerId),
    secondaries: ready && !missingCards.length,
    reserves: ready,
    // Nothing is recorded for deployment itself, so it owes nothing once it can be played.
    deploy: Boolean(view.deploymentId && view.attackerId),
    'first-turn': Boolean(view.firstPlayerId),
    'pre-battle': Boolean(firstSide),
  }
  /** Steps are reached in order: nothing after Opponent until someone is on their way. */
  const reached = (id: SectionId) => id === 'format' || id === 'opponent' || complete.opponent || Boolean(draft?.invite)
  const locked: Record<SectionId, boolean> = {
    format: false,
    opponent: !reached('opponent'),
    // A reader with no seat has no army of their own, so these open with the table's.
    // The missions come from both armies' dispositions, so they wait for every army.
    mission: !reached('mission') || !ready,
    battlefield: !reached('battlefield') || !ready || (!kotc && !complete.mission),
    defender: !reached('defender') || !armiesIn,
    secondaries: !reached('secondaries') || !ready,
    reserves: !reached('reserves') || (watching ? !ready : !youHaveAnArmy),
    deploy: !reached('deploy') || !view.deploymentId || !view.attackerId,
    'first-turn': !reached('first-turn') || (manual ? !armiesIn : !view.deploymentId || !view.attackerId),
    'pre-battle': !reached('pre-battle') || !firstSide,
  }
  /*
   * A step whose default is already a valid answer — the missions the armies imply, Tactical
   * secondaries, every unit on the battlefield, no pre-battle moves — owes nothing but has not been answered
   * either, so its number is a checkbox the table ticks itself, kept in the log for every device.
   */
  const settled: Record<SectionId, boolean> = {
    ...complete,
    mission: complete.mission && checked('mission'),
    secondaries: complete.secondaries && checked('secondaries'),
    reserves: complete.reserves && checked('reserves'),
    deploy: complete.deploy && checked('deploy'),
    'pre-battle': complete['pre-battle'] && checked('pre-battle'),
  }
  const land = (id: SectionId | undefined) => id && landOn(document.getElementById(`setup-${id}`))
  /** Ticks or clears a defaulted step for the whole table. */
  const check = (id: SectionId) => ({
    checked: settled[id],
    disabled: busy || locked[id] || !complete[id],
    onCheck: () => {
      const ticking = !settled[id]
      send({ kind: 'set-setup-checked', step: SECTION_IDS.indexOf(id), checked: ticking })
      if (ticking) land(SECTION_IDS.slice(SECTION_IDS.indexOf(id) + 1).find((later) => !skipped(later)))
    },
  })
  /** The first step the table still owes an answer to, which the bar takes the reader to. */
  const next = SECTION_IDS.find((id) => !locked[id] && !complete[id] && !NOTHING_OWED.has(id) && !skipped(id))
  const step = (id: SectionId) => ({
    id,
    complete: complete[id],
    settled: settled[id],
    locked: locked[id],
    current: next === id,
    skipped: skipped(id),
    watching,
  })
  // The places are the table's to change only while it is set up through them, never in a sealed event.
  const changePlaces =
    places && !watching && !view.sealedEventToken
      ? (side: number, by: 1 | -1, then?: () => void) => {
          const counts = places.map((count, at) => (at === side ? count + by : count)) as [number, number]
          const players = counts[0] + counts[1]
          // Two allies facing one player share their side's points; a doubles army brings half.
          configure(
            {
              places: counts,
              playerCount: players as 2 | 3 | 4,
              teamBattle: players > 2,
              armyPoints: null,
              sharedArmyPoints: players === 3,
            },
            then,
          )
        }
      : null
  /** Whoever plays every side holds an ally place they add too, and gives one up by leaving it before closing it. */
  const playingAll = Boolean(places) && playsEverySide(view)
  const fill = usePlayEverySide(view.token)
  const dropPlace = useMutation({
    mutationFn: async ({ side, playerId }: { side: number; playerId: string }) => {
      await removeBattlePlayer({ data: { token: view.token, playerId } })
      await queryClient.invalidateQueries({ queryKey: battleQuery(view.token).queryKey })
      changePlaces?.(side, -1)
    },
  })
  const removePlace = (side: number) => {
    if (!changePlaces || places![side] !== 2) return undefined
    if (open[side]) return () => changePlaces(side, -1)
    const played = playingAll ? view.players.findLast((player) => player.side === side && isPracticeSeat(player)) : undefined
    return played ? () => dropPlace.mutate({ side, playerId: played.id }) : undefined
  }
  const refreshPlaces = () => refreshTable(queryClient, view.token)
  const giveBack = useInvitePlayersInstead(view, refreshPlaces)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const played = view.players.filter((player) => !player.isViewer && isPracticeSeat(player)).length
  /**
   * Until the battle starts, the creator gives the places they play back to the link, all together so no table mixes
   * played and invited places, or takes a joined player out.
   */
  const releases = (side: number) => {
    if (!places || watching || view.sealedEventToken || view.viewerId !== view.creatorId) return []
    const others = view.players.filter((player) => player.side === side && !player.isViewer)
    return [
      ...(others.some(isPracticeSeat)
        ? [{ label: played > 1 ? 'Invite players instead' : 'Invite a player instead', run: () => giveBack.mutate() }]
        : []),
      ...others
        .filter((player) => !isPracticeSeat(player))
        .map((player) => ({ label: `Remove ${player.name}`, run: () => setRemoving(player) })),
    ]
  }
  const share = () => {
    if (!draft?.invite) shareLink.mutate()
    land('opponent')
  }
  const shownLimit = view.settings.limit ?? format.limit
  const builtLists = table.flatMap((side) => side.armies).filter((army) => army.roster?.built)
  const shortText =
    short && `${sideName(table.find((side) => side.index === short.side)!)} brings ${pointsLabel(short.points)} and plays short.`
  /** One line under the cards: what stops the size, or the size the lists set and who plays short. */
  const sizeLine =
    sizeProblem ??
    (shownLimit !== null && view.settings.sizeFromRosters
      ? `A ${shownLimit.toLocaleString('en')}-point battle, set by ${builtLists.length > 1 || team ? 'the bigger side' : builtLists[0]?.roster?.name}. ${shortText || 'A bigger or smaller list changes it.'}`
      : shortText)
  const deployment = deploymentFor(view.deploymentId, deployments)
  const group = groups?.current?.name

  return (
    <main className="flex w-full flex-col">
      <SideFocusProvider value={{ side: focusedSide ?? yours?.index ?? 0, show: setFocusedSide }}>
        <div className="mx-auto w-full max-w-5xl px-3 pt-6 sm:px-4">
          <SetupHeader token={view.token} watching={watching} draft={Boolean(draft?.draft)}>
            <FaceOff
              view={view}
              sides={table}
              open={open}
              onSimulate={watching ? setCombatSelection : undefined}
              controls={
                watching || !attachRoster
                  ? undefined
                  : {
                      shared: Boolean(draft?.invite),
                      playingAll,
                      busy: busy || shareLink.isPending || fill.isPending || dropPlace.isPending || giveBack.isPending,
                      send,
                      onShare: share,
                      onChoose: (army) => chooseRoster(army.playerId),
                      onAddAlly: (side) =>
                        changePlaces && places![side] === 1
                          ? () => changePlaces(side, 1, playingAll ? () => fill.mutate() : undefined)
                          : undefined,
                      onRemovePlace: removePlace,
                      releases,
                      problems: (side) => (armyProblem?.side === side ? armyProblemText : undefined),
                    }
              }
            />
            {dropPlace.error ? <Problem error={dropPlace.error} /> : giveBack.error ? <Problem error={giveBack.error} /> : null}
            <RemovePlayerDialog token={view.token} player={removing} onClose={() => setRemoving(null)} onRemoved={refreshPlaces} />
            {sizeLine ? (
              <p className={cn('relative text-center text-xs', sizeProblem ? 'text-discarded' : 'text-dim')}>{sizeLine}</p>
            ) : null}
          </SetupHeader>

          <ol className="mt-10">
            <SpineStep
              {...step('format')}
              number={1}
              name="Tracking"
              onboarding="battle-setup-size"
              needed={!complete.format}
              hint={
                !sizeFixed && view.settings.limit === null
                  ? 'Choose the battle size.'
                  : !manual && !chosenPack
                    ? 'Choose a mission pack.'
                    : undefined
              }
              summary={
                <>
                  <span className="font-bold uppercase">{manual ? 'Manual' : 'Guided'}</span>
                  <span className="text-dim">
                    {' '}
                    · {sizeName}
                    {group ? ` · ${group}` : ''}
                  </span>
                </>
              }
            >
              <FormatStep view={view} send={send} configure={configure} busy={busy} sizeFixed={sizeFixed} />
            </SpineStep>

            <SpineStep
              {...step('opponent')}
              number={2}
              name={watching || view.players.length + openCount > 2 ? 'Players' : 'Opponent'}
              needed={openCount > 0 && !draft?.invite && !playingAll}
              hint={
                playingAll
                  ? undefined
                  : openCount === 0
                    ? view.viewerId === view.creatorId && view.players.length > 1
                      ? 'You can remove them until the battle starts.'
                      : undefined
                    : draft?.invite
                      ? 'Waiting for them to open the link. Keep setting up meanwhile.'
                      : openCount > 1
                        ? `${openCount} players to join before the battle starts. One link is enough for all of them.`
                        : yours && open[yours.index]
                          ? 'Invite your ally. The battle starts once they have joined.'
                          : 'Invite your opponent. The battle starts once they have joined.'
              }
              summary={
                playingAll ? (
                  <span className="font-bold uppercase">You play every side</span>
                ) : openCount ? (
                  <span className="text-dim">{openCount > 1 ? `${openCount} places open` : 'No opponent yet'}</span>
                ) : (
                  <span className="font-bold uppercase">
                    {formatList(view.players.filter((player) => !player.isViewer).map((player) => player.name))}
                  </span>
                )
              }
            >
              {places ? <OpponentStep view={view} open={openCount} draft={draft} both={fill} /> : null}
            </SpineStep>

            <SpineStep
              {...step('mission')}
              check={check('mission')}
              number={3}
              name="Mission"
              onboarding="battle-setup-mission"
              sides={table}
              renderSide={(side) => <MissionAnswer side={side} nameDisposition={nameDisposition} />}
              needed={ready && undecided.length > 0}
              hint={
                !youHaveAnArmy
                  ? 'Choose your army to see the missions.'
                  : !ready
                    ? 'The missions show once every army is in.'
                    : undecided.length
                      ? 'Choose the Force Disposition each allied side plays.'
                      : twists.length
                        ? `Each side plays the primary listed against its opponent’s Force Disposition. ${twist ? `Twist: ${twist.name}.` : 'No twist.'}`
                        : 'Each side plays the primary listed against its opponent’s Force Disposition.'
              }
            >
              {ready ? (
                <MissionStep
                  sides={table}
                  send={send}
                  configure={configure}
                  busy={busy}
                  twists={twists}
                  twistId={view.settings.twistId}
                  primaryCardFor={primaryCardFor}
                  onRead={setReading}
                />
              ) : null}
            </SpineStep>

            <SpineStep
              {...step('battlefield')}
              number={4}
              name="Battlefield"
              onboarding="battle-setup-battlefield"
              needed={ready && !view.deploymentId}
              hint={
                kotc
                  ? 'The terrain and objectives always go in the same places.'
                  : view.deploymentId
                    ? 'One shared choice sets the deployment zones and the terrain for both sides.'
                    : 'Choose a layout. It sets the deployment zones and the terrain for both sides.'
              }
              summary={
                <>
                  {deployment ? (
                    <span className="font-bold uppercase">{deployment.name}</span>
                  ) : (
                    <span className="text-dim">No layout yet</span>
                  )}
                </>
              }
            >
              {youHaveAnArmy ? (
                <Battlefield
                  view={view}
                  send={send}
                  pending={busy}
                  allowedIds={mission?.deploymentIds}
                  matchup={matchupName(table, nameDisposition)}
                />
              ) : null}
            </SpineStep>

            <SpineStep
              {...step('defender')}
              number={5}
              name="Defender"
              onboarding="battle-setup-defender"
              needed={armiesIn && !view.attackerId}
              hint={
                armiesIn
                  ? 'Roll off. The winner chooses the defender, who deploys first.'
                  : 'Once the armies are chosen, roll off. The winner chooses the defender.'
              }
              summary={
                <>
                  {defender ? (
                    <>
                      <span className={`font-bold uppercase ${tint(defender.index).text}`}>
                        <SideNames side={defender} />
                      </span>
                      <span className="text-dim"> defends · deploys first</span>
                    </>
                  ) : (
                    <span className="text-dim">Not rolled yet</span>
                  )}
                </>
              }
            >
              {armiesIn ? <DefenderStep sides={table} attackerId={view.attackerId} disabled={busy} send={send} /> : null}
            </SpineStep>

            <SpineStep
              {...step('secondaries')}
              check={check('secondaries')}
              number={6}
              name="Secondaries"
              onboarding="battle-setup-secondaries"
              sides={table}
              renderSide={(side) => <SecondariesAnswer side={side} ready={ready} />}
              needed={youHaveAnArmy && ready && missingCards.length > 0}
              hint={
                ready && missingCards.length
                  ? 'Waiting for every side’s mission cards.'
                  : 'Tactical cards are dealt as the battle runs. Fixed cards are chosen now and played all game.'
              }
            >
              {youHaveAnArmy ? <SecondariesStep view={view} sides={table} send={send} pending={pending} /> : null}
            </SpineStep>

            <SpineStep
              {...step('reserves')}
              check={check('reserves')}
              number={7}
              name="Reserves"
              onboarding="battle-setup-reserves"
              sides={table}
              renderSide={(side) => <ReservesAnswer side={side} />}
              hint="Every unit starts on the battlefield unless its side holds it back in reserves, deep strike or a transport."
            >
              {youHaveAnArmy && sendCommand ? (
                <ReservesStep view={view} sides={table} send={sendCommand} problem={problem} sentFrom={reserveRow} onSent={setReserveRow} />
              ) : null}
            </SpineStep>

            <SpineStep
              {...step('deploy')}
              check={check('deploy')}
              number={8}
              name="Deploy"
              onboarding="battle-setup-deploy"
              sides={table}
              renderSide={(side) => <PrebattleAnswer side={side} rule="infiltrators" />}
              hint={`Sides alternate setting up one unit at a time${defender ? `, ${sideName(defender)} first` : ''}. Units in strategic reserves stay off the table.`}
            >
              {youHaveAnArmy ? <DeployUnits sides={table} storageKey={`praetorium.placed.${view.token}`} /> : null}
            </SpineStep>

            <SpineStep
              {...step('first-turn')}
              number={manual ? 3 : 9}
              name="First turn"
              onboarding="battle-setup-first"
              needed={!locked['first-turn'] && !view.firstPlayerId}
              hint={
                manual
                  ? armiesIn
                    ? 'Roll off. The winner takes the first turn.'
                    : 'Once the armies are chosen, roll off. The winner takes the first turn.'
                  : view.attackerId
                    ? 'Once both armies are deployed, roll off. The winner takes the first turn.'
                    : 'Once the defender is chosen and both armies are deployed, roll off. The winner takes the first turn.'
              }
              summary={
                <>
                  {firstSide ? (
                    <>
                      <span className={`font-bold uppercase ${tint(firstSide.index).text}`}>
                        <SideNames side={firstSide} />
                      </span>
                      <span className="text-dim"> takes the first turn</span>
                    </>
                  ) : (
                    <span className="text-dim">Not rolled yet</span>
                  )}
                </>
              }
            >
              {manual || view.deploymentId ? (
                <FirstTurnStep
                  sides={table}
                  first={firstSide?.index ?? null}
                  disabled={busy || (manual ? !armiesIn : !view.attackerId)}
                  send={send}
                />
              ) : null}
            </SpineStep>

            <SpineStep
              {...step('pre-battle')}
              check={check('pre-battle')}
              number={10}
              name="Pre-battle rules"
              sides={table}
              renderSide={(side) => <PrebattleAnswer side={side} rule="scouts" />}
              hint={`Sides alternate resolving pre-battle rules${firstSide ? `, ${sideName(firstSide)} first` : ''}. Start battle opens the first Command phase.`}
            >
              {youHaveAnArmy ? <PrebattleUnits sides={table} /> : null}
            </SpineStep>
          </ol>
          {attachRoster && !watching ? (
            <ArmyChooser view={view} sides={table} attachRoster={attachRoster} pending={busy} problem={problem} />
          ) : null}
          {reading ? <MissionDetailsDialog details={reading} onOpenChange={(shown) => !shown && setReading(null)} /> : null}
          {combatSelection ? <BattleCombatDialog view={view} selection={combatSelection} onClose={() => setCombatSelection(null)} /> : null}
        </div>

        <SetupBar
          problem={reserveRow ? null : problem}
          remaining={remaining}
          next={next}
          watching={watching}
          pending={pending}
          share={openCount && places && !draft?.invite ? { pending: shareLink.isPending, onShare: share } : undefined}
          onChooseArmy={yourArmy && attachRoster ? () => chooseRoster(yourArmy.playerId) : undefined}
          onBegin={
            firstSide
              ? () => send({ kind: 'begin-battle', firstPlayerId: firstSide.captain.id, attackerId: view.attackerId ?? undefined })
              : undefined
          }
        />
      </SideFocusProvider>
    </main>
  )
}

/** The steps a manually tracked battle does not play. */
const MANUAL_SKIPS = new Set<SectionId>(['mission', 'battlefield', 'defender', 'secondaries', 'reserves', 'deploy', 'pre-battle'])
/** Steps that record nothing the battle needs before it can begin. */
const NOTHING_OWED = new Set<SectionId>(['reserves', 'deploy', 'pre-battle'])
