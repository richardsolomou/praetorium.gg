import { GuideHelp } from '../../onboarding/GuideHelp'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, QrCode } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Command } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import {
  armyPointsFor,
  sharedSidePoints,
  battlePointsBudget,
  openPlaces,
  stillFilling,
  FIXED_SECONDARIES,
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
import { battleGroupsQuery, battleQuery, deploymentsQuery, gameReferencesQuery, meQuery } from '../../../queries'
import { fixedHandShort, missionCardsReady, type Side, type SideMission, sideName, sideOf, sides as foldSides } from '../../../sides'
import type { RosterAttachment, SendCommand } from '../useCommand'
import { GroupChoice } from './GroupChoice'
import { SearchableSelect, type SearchableGroup } from '../../../components/SearchableSelect'
import { advanceOnboarding } from '../../onboarding/onboarding'
import { Battlefield } from './Battlefield'
import { ArmyChooser } from './ArmiesStep'
import { FaceOff } from './FaceOff'
import { OpponentStep, useDraft, useShareBattle } from './OpponentStep'
import { useHistoryDialog } from '../../../useHistoryDialog'
import {
  BATTLE_SIZE_CONTROL,
  CHOOSABLE,
  CHOSEN,
  landOn,
  SetupSidePanel,
  SideFocusProvider,
  SideSwitch,
  SideSwitchNext,
  useDispositionNames,
} from './chrome'
import { TwistChoice } from './TwistChoice'
import { DefenderStep } from './DefenderStep'
import { FirstTurnStep } from './FirstTurnStep'
import { DeployUnits, prebattleCounts, PrebattleUnits } from './PrebattleUnits'
import { SideDispositionChoice } from './SideDispositionChoice'
import { ReservesStep } from './ReservesStep'
import { SecondariesStep } from './SecondariesStep'
import { MissionDetailsDialog, type MissionDetails } from '../MissionCards'
import { useSpectated } from '../Spectator'
import { BattleCombatDialog, type BattleCombatSelection } from '../../simulator/BattleCombatDialog'
import { tint } from '../battleTints'
import type { OnboardingTarget } from '../../../onboardingTargets'
import { attachedUnitList } from '../../../../core/attachedUnits'
import { Choice } from '../../../components/Choice'
import { countLabel, formatList } from '../../../text'
import { deploymentFor } from '../../../battleSummary'

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

/** Every matched-play size, named and priced, for the one control that asks for it; King of the Colosseum is a duel. */
const sizeOptions = (teamBattle: boolean): SearchableGroup[] => [
  {
    label: '',
    items: GAME_SIZES.filter((size) => !teamBattle || !isKotcLimit(size.limit)).map((size) => ({
      label: battleSizeOptionLabel(size),
      value: String(size.limit),
    })),
  },
]

/** In the log's order: a tick stores a step's index, so a step is never moved or removed, only renamed in place. */
const SECTION_IDS = [
  'format',
  'opponent',
  'mission',
  'battlefield',
  'defender',
  'secondaries',
  'reserves',
  'deploy',
  'first-turn',
  'pre-battle',
] as const
type SectionId = (typeof SECTION_IDS)[number]
/** How often setup asks whether someone has joined an open place. */
const JOIN_POLL_MS = 3_000
const BUDGET_MISMATCH = 'Choose rosters with the same points budget for each side.'

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
  const { data: me } = useQuery(meQuery())
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
  // A practice opponent brings nothing on its own, so its list is one of the ones
  // this table still owes before setup can move on.
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

  const configure = (settings: Partial<Omit<Extract<Command, { kind: 'configure-battle' }>, 'kind'>>) =>
    send({
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
    })

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
  // A battle that seated its table at creation chose its tracking there.
  const trackingChosen = !places || checked('format')
  const armiesIn = view.settings.limit !== null && ready && !budgetsDiffer && !armyProblem && !leaderless.length
  const complete: Record<SectionId, boolean> = {
    format: trackingChosen && (view.settings.limit !== null || sizeFixed) && (manual || Boolean(chosenPack)),
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
  /** Steps are reached in order: nothing after Tracking until it is chosen, nothing after Opponent until someone is on their way. */
  const reached = (id: SectionId) =>
    id === 'format' || (trackingChosen && (id === 'opponent' || complete.opponent || Boolean(draft?.invite)))
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
  /** Choosing an army or sharing the link goes on with the tracking as it stands, Guided unless changed. */
  const acceptTracking = () => {
    if (!trackingChosen) send({ kind: 'set-setup-checked', step: SECTION_IDS.indexOf('format'), checked: true })
  }
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
      ? (side: number, by: 1 | -1) => {
          const counts = places.map((count, at) => (at === side ? count + by : count)) as [number, number]
          const players = counts[0] + counts[1]
          // Two allies facing one player share their side's points; a doubles army brings half.
          configure({
            places: counts,
            playerCount: players as 2 | 3 | 4,
            teamBattle: players > 2,
            armyPoints: null,
            sharedArmyPoints: players === 3,
          })
        }
      : null
  const share = () => {
    acceptTracking()
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
          <header className="relative space-y-5 pb-2">
            <div aria-hidden className="construction-grid -inset-x-3 -top-6 sm:-inset-x-4" />
            <div className="relative space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl text-balance sm:text-3xl">
                  {watching ? 'Battle setup' : 'Set up the battle'}
                  {draft?.draft ? <span className="chip align-middle font-sans text-xs text-dim">Draft</span> : null}
                </h1>
                {watching ? (
                  me ? null : (
                    <Link
                      to="/sign-in"
                      search={{ next: `/battles/${view.token}` }}
                      rel="nofollow"
                      className="shrink-0 text-xs text-info hover:text-bone"
                    >
                      Sign in to play
                    </Link>
                  )
                ) : (
                  <GuideHelp task="battle" step="battle-setup-size">
                    Battle setup guide
                  </GuideHelp>
                )}
              </div>
              <p className="max-w-prose text-sm text-dim sm:text-base">
                {watching
                  ? 'The players are still setting up. Their choices show here, and the battle opens on this page once they start.'
                  : draft?.draft
                    ? 'A draft until everyone has joined with an army.'
                    : 'In the order the rules play it. Anyone at the table can answer for either side.'}
              </p>
            </div>
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
                      busy: busy || shareLink.isPending,
                      send,
                      onShare: share,
                      onChoose: (army) => {
                        acceptTracking()
                        chooseRoster(army.playerId)
                      },
                      onAddAlly: (side) => (changePlaces && places![side] === 1 ? () => changePlaces(side, 1) : undefined),
                      onRemovePlace: (side) =>
                        changePlaces && open[side] && places![side] === 2 ? () => changePlaces(side, -1) : undefined,
                      problems: (side) => (armyProblem?.side === side ? armyProblemText : undefined),
                    }
              }
            />
            {sizeLine ? (
              <p className={cn('relative text-center text-xs', sizeProblem ? 'text-discarded' : 'text-dim')}>{sizeLine}</p>
            ) : null}
          </header>

          <ol className="mt-10">
            <SpineStep
              {...step('format')}
              number={1}
              name="Tracking"
              onboarding="battle-setup-size"
              needed={trackingChosen && !complete.format}
              hint={
                !trackingChosen
                  ? undefined
                  : !sizeFixed && view.settings.limit === null
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
              <div className="grid gap-4 sm:grid-cols-2">
                {view.sealedEventToken ? null : (
                  <div className="sm:col-span-2">
                    <Choice
                      label="How you track it"
                      value={trackingChosen ? (manual ? 'manual' : 'guided') : null}
                      options={[
                        {
                          value: 'guided',
                          name: 'Guided',
                          count: 'Recommended',
                          detail:
                            'Draws your mission cards, asks what you scored each turn and keeps your CP. The result, replay and stats go in your record.',
                        },
                        {
                          value: 'manual',
                          name: 'Manual',
                          detail: 'A scoreboard. You enter scores and CP from your own cards, with no prompts or caps.',
                        },
                      ]}
                      columns={2}
                      disabled={busy}
                      onChange={(tracking) => {
                        if ((tracking === 'manual') !== manual)
                          configure(
                            tracking === 'manual'
                              ? { manual: true, missionPackId: null, twistId: null, terrainLayoutId: null }
                              : { manual: false, missionPackId: references?.packs[0]?.id ?? null },
                          )
                        acceptTracking()
                      }}
                    />
                  </div>
                )}
                {sizeFixed ? null : (
                  <div>
                    <Label htmlFor={BATTLE_SIZE_CONTROL} className="eyebrow">
                      Battle size
                    </Label>
                    <SearchableSelect
                      id={BATTLE_SIZE_CONTROL}
                      ariaLabel="Battle size"
                      groups={sizeOptions(team)}
                      value={view.settings.limit === null ? '' : String(view.settings.limit)}
                      onValueChange={(value) => configure({ limit: Number(value) })}
                      placeholder="Choose a battle size"
                      searchPlaceholder="Search sizes…"
                      className="mt-1 h-11"
                    />
                  </div>
                )}
                {references && references.packs.length > 1 && !manual ? (
                  <fieldset>
                    <legend className="eyebrow">Mission pack</legend>
                    <div className="mt-1 grid gap-2">
                      {references.packs.map((pack) => (
                        <Button
                          key={pack.id}
                          variant="outline"
                          aria-pressed={view.settings.missionPackId === pack.id}
                          className={`h-auto min-h-11 justify-start px-3 py-2 text-left text-sm font-bold uppercase ${
                            view.settings.missionPackId === pack.id ? CHOSEN : CHOOSABLE
                          }`}
                          onClick={() => configure({ missionPackId: pack.id, twistId: null })}
                        >
                          {pack.name}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
                {view.sealedEventToken || manual ? null : <GroupChoice view={view} send={send} disabled={busy} className="sm:col-span-2" />}
              </div>
            </SpineStep>

            <SpineStep
              {...step('opponent')}
              number={2}
              name={watching || openCount > 1 ? 'Players' : 'Opponent'}
              needed={openCount > 0 && !draft?.invite}
              hint={
                openCount === 0
                  ? draft?.draft && view.viewerId === view.creatorId && view.players.length > 1
                    ? 'You can remove them until everyone’s army is in.'
                    : undefined
                  : draft?.invite
                    ? 'Waiting for them to open the link. Keep setting up meanwhile.'
                    : openCount > 1
                      ? `${openCount} players to join before the battle starts. One link is enough for all of them.`
                      : 'Invite your opponent. The battle starts once they have joined.'
              }
              summary={
                openCount ? (
                  <span className="text-dim">{openCount > 1 ? `${openCount} places open` : 'No opponent yet'}</span>
                ) : (
                  <span className="font-bold uppercase">
                    {formatList(view.players.filter((player) => !player.isViewer).map((player) => player.name))}
                  </span>
                )
              }
            >
              {places ? <OpponentStep view={view} open={openCount} draft={draft} /> : null}
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
                <>
                  <div className="grid items-start gap-6 md:grid-cols-2">
                    {table.map((side) => {
                      const card = side.mission ? primaryCardFor(side.mission.id) : undefined
                      return (
                        <SetupSidePanel key={side.index} side={side} className="space-y-3">
                          {side.mission ? (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="min-w-0 text-xl break-words">{side.mission.name}</h3>
                              {card ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Read ${side.mission.name}`}
                                  onClick={() => setReading({ name: side.mission!.name, card, type: 'Primary mission' })}
                                >
                                  Read card
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <p className="py-2 text-sm text-dim">No mission for this matchup.</p>
                          )}
                          <SideDispositionChoice side={side} nameDisposition={nameDisposition} send={send} />
                        </SetupSidePanel>
                      )
                    })}
                  </div>
                  {twists.length ? (
                    <TwistChoice
                      twists={twists}
                      chosenId={view.settings.twistId}
                      disabled={busy}
                      onChoose={(twistId) => configure({ twistId })}
                    />
                  ) : null}
                </>
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
                      <span className={`font-bold uppercase ${tint(defender.index).text}`}>{sideName(defender)}</span>
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
                  ? 'Roll off. The winner takes the first turn.'
                  : 'Once both armies are deployed, roll off. The winner takes the first turn.'
              }
              summary={
                <>
                  {firstSide ? (
                    <>
                      <span className={`font-bold uppercase ${tint(firstSide.index).text}`}>{sideName(firstSide)}</span>
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

        <div data-setup-bar className="sticky bottom-0 z-20 mt-4 border-t border-edge bg-sunken">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
            <div className="min-w-0" aria-live="polite">
              {problem && !reserveRow ? (
                <p className="line-clamp-2 text-sm text-destructive">{problem}</p>
              ) : remaining.length ? (
                <a href={next ? `#setup-${next}` : undefined} className="block min-w-0 hover:text-bone">
                  <span className="figure block text-xs font-bold text-discarded uppercase">{remaining.length} left</span>
                  <span className="block truncate text-xs text-dim">{remaining.join(' · ')}</span>
                </a>
              ) : (
                <p className="text-xs font-bold text-achieved uppercase">Ready</p>
              )}
            </div>
            {watching ? (
              <p className="shrink-0 text-xs text-dim">{remaining.length ? 'Being set up' : 'Waiting to start'}</p>
            ) : openCount && places && !draft?.invite ? (
              <Button className="h-11 shrink-0 px-5 text-base" disabled={shareLink.isPending} onClick={share}>
                <QrCode /> Share a link
              </Button>
            ) : yourArmy && attachRoster ? (
              <Button
                className="h-11 shrink-0 px-5 text-base"
                onClick={() => {
                  acceptTracking()
                  chooseRoster(yourArmy.playerId)
                }}
              >
                Choose your army
              </Button>
            ) : (
              <Button
                data-onboarding="battle-setup-begin"
                className="h-11 shrink-0 px-5 text-base"
                disabled={pending || remaining.length > 0 || !firstSide}
                onClick={() => {
                  if (firstSide)
                    send({ kind: 'begin-battle', firstPlayerId: firstSide.captain.id, attackerId: view.attackerId ?? undefined })
                }}
              >
                Start battle
              </Button>
            )}
          </div>
        </div>
      </SideFocusProvider>
    </main>
  )
}

/** The steps a manually tracked battle does not play. */
const MANUAL_SKIPS = new Set<SectionId>(['mission', 'battlefield', 'defender', 'secondaries', 'reserves', 'deploy', 'pre-battle'])
/** Steps that record nothing the battle needs before it can begin. */
const NOTHING_OWED = new Set<SectionId>(['reserves', 'deploy', 'pre-battle'])

/**
 * One step of setup, hung from the spine.
 *
 * Every step stays open, so the whole of setup reads at once; one not reached yet is faded and can't be used. Without
 * controls to show, as for a reader with no seat or a step waiting on the armies, it reads as its answer: one line
 * for a choice the table shares, or a cell either side of the spine for one each side makes.
 */
function SpineStep({
  watching = false,
  skipped = false,
  id,
  number,
  name,
  complete,
  settled,
  locked,
  current,
  needed = false,
  hint,
  onboarding,
  sides,
  renderSide,
  summary,
  check,
  children,
}: {
  /** Read by someone with no seat: only the answers, without the step's controls or the hints about what to do. */
  watching?: boolean
  /** Absent from a battle that does not play this step, such as a manually tracked one. */
  skipped?: boolean
  id: SectionId
  number: number
  name: string
  /** Whether the step owes nothing more before the battle can begin. */
  complete: boolean
  /** Whether it has been answered rather than only left at a valid default, which ticks it. */
  settled: boolean
  locked: boolean
  /** The first step still owed an answer. */
  current: boolean
  /** Whether the hint names something the table still owes, rather than describing the step. */
  needed?: boolean
  hint?: string
  onboarding?: OnboardingTarget
  /** A step each side answers for itself: both sides, and how to read one side's answer. */
  sides?: Side[]
  renderSide?: (side: Side) => ReactNode
  /** The table's one answer, for a step the sides share. */
  summary?: ReactNode
  /** The tick the table gives a step whose default is a valid answer, drawn on its number. */
  check?: { checked: boolean; disabled: boolean; onCheck: () => void }
  children: ReactNode
}) {
  if (skipped) return null
  const body = watching ? null : children
  const tick = watching ? undefined : check
  // The runner down from the step's number says where the table is: settled solid, the step owed now doubled, the rest dashed.
  const line = settled ? 'done' : current ? 'now' : locked ? 'locked' : 'todo'
  return (
    <li className="list-none">
      <section
        id={`setup-${id}`}
        data-onboarding={onboarding}
        data-locked={locked}
        data-complete={complete}
        aria-labelledby={`setup-${id}-title`}
        className={cn('relative scroll-mt-(--app-header)! pb-8', locked && 'text-faint')}
      >
        <span
          aria-hidden
          data-line={line}
          className={cn(
            'absolute top-13 bottom-1 left-6 -translate-x-1/2 sm:top-15 sm:left-[2.375rem]',
            line === 'done' && 'w-0.5 rounded-full bg-parchment/45',
            line === 'now' && 'w-1.5 origin-top animate-draw-down border-x-2 border-parchment',
            line === 'todo' && 'w-0.5 bg-[repeating-linear-gradient(180deg,var(--color-runner-hi)_0_5px,transparent_5px_10px)]',
            line === 'locked' && 'w-0.5 bg-[repeating-linear-gradient(180deg,var(--color-runner)_0_5px,transparent_5px_10px)]',
          )}
        />
        {/* Held under the app header while the step's body scrolls past, so its tick stays in reach. */}
        <div className="sticky top-(--app-header) z-10 flex items-center gap-3 bg-void/95 py-1 backdrop-blur sm:gap-5">
          {/* Outside the heading, so the step is still named by its title alone. */}
          {tick ? (
            <label
              title={tick.checked ? `Mark ${name} not done` : `Mark ${name} done`}
              className="group/check relative grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-lg has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-primary sm:w-19"
            >
              <input
                type="checkbox"
                className="sr-only"
                aria-label={`${name} done`}
                checked={tick.checked}
                disabled={tick.disabled}
                onChange={tick.onCheck}
              />
              <StepMark settled={settled} current={current} locked={locked} number={number} checkable={!tick.disabled} />
            </label>
          ) : (
            <span aria-hidden className="relative grid h-12 w-12 shrink-0 place-items-center sm:w-19">
              <StepMark settled={settled} current={current} locked={locked} number={number} checkable={false} />
            </span>
          )}
          <h2 id={`setup-${id}-title`} className="flex min-h-11 min-w-0 flex-1 items-center text-lg normal-case sm:text-xl">
            <span className={cn('min-w-0', current ? 'text-bone' : locked ? 'text-faint' : undefined)}>{name}</span>
          </h2>
        </div>
        <div className={cn('pl-15 sm:pl-24', locked && 'opacity-50')}>
          {hint && !watching ? (
            <p className={cn('mt-0.5 max-w-prose text-sm text-balance', needed ? 'text-discarded' : 'text-dim')}>{hint}</p>
          ) : null}
          {/* Only the controls go inert: the hint above says why the step isn't open yet. */}
          <div id={`setup-${id}-body`} className="relative mt-3" inert={locked}>
            {body ? (
              <div className={cn('relative', current ? 'rounded-2xl border-2 border-runner bg-panel shadow-lifted' : 'part')}>
                {/* The step being answered is drawn out of the frame, joined back to the runner by its own sprue. */}
                {current ? (
                  <>
                    <span
                      aria-hidden
                      className="absolute -top-5 -left-[2.375rem] h-9 w-[2.25rem] rounded-bl-xl border-b-2 border-l-2 border-runner sm:-left-[3.75rem] sm:w-[3.625rem]"
                    />
                    <span aria-hidden className="absolute top-2.5 -left-1.5 size-2.5 rounded-full bg-parchment ring-3 ring-void" />
                  </>
                ) : null}
                {sides && renderSide ? <SideSwitch sides={sides} renderSide={renderSide} /> : null}
                <div className="space-y-4 p-3 sm:p-4">
                  {body}
                  {sides ? <SideSwitchNext sides={sides} /> : null}
                </div>
              </div>
            ) : sides && renderSide ? (
              <div className="grid grid-cols-2 items-stretch gap-2">
                {sides.map((side, position) => (
                  <div
                    key={side.index}
                    className={cn(
                      'min-w-0 rounded-lg border border-t-2 border-edge bg-sunken px-3 py-2 text-sm',
                      tint(side.index).edge,
                      position ? 'text-right' : 'text-left',
                    )}
                  >
                    {renderSide(side)}
                  </div>
                ))}
              </div>
            ) : summary ? (
              <div className="w-fit max-w-full rounded-lg border border-edge bg-sunken px-3 py-2 text-left text-sm text-balance">
                {summary}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </li>
  )
}

/** A step's assembly number, with its tick once settled; a checkbox's box when the table ticks it. */
function StepMark({
  settled,
  current,
  locked,
  number,
  checkable,
}: {
  settled: boolean
  current: boolean
  locked: boolean
  number: number
  checkable: boolean
}) {
  return (
    <>
      <span
        className={cn(
          'step-number transition-colors',
          settled
            ? 'text-dim'
            : current
              ? 'text-bone'
              : locked
                ? 'text-transparent [-webkit-text-stroke:1.2px_var(--color-runner-hi)]'
                : undefined,
        )}
      >
        {number}
      </span>
      {settled ? (
        <span className="absolute -top-1 right-0 grid size-5.5 animate-in place-items-center rounded-full bg-parchment text-parchment-ink duration-200 ease-settle zoom-in-50 fade-in-0 sm:right-2">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : checkable ? (
        <span className="absolute -top-1 right-0 size-5.5 rounded-full border-2 border-runner-hi bg-void transition-colors group-hover/check:border-parchment sm:right-2" />
      ) : null}
    </>
  )
}

/** One side's answer to a step: what it is, then what it means. Inline throughout, since the side switch is a button. */
function Answer({ value, detail, tone }: { value: ReactNode; detail?: ReactNode; tone?: 'needed' | 'quiet' }) {
  return (
    <>
      <span
        className={cn(
          'block font-bold break-words uppercase',
          tone === 'needed' ? 'text-discarded' : tone === 'quiet' ? 'font-normal text-dim normal-case' : undefined,
        )}
      >
        {value}
      </span>
      {detail ? <span className="block text-xs text-dim">{detail}</span> : null}
    </>
  )
}

function MissionAnswer({
  side,
  nameDisposition,
}: {
  side: Side
  nameDisposition: (id: string | null | undefined) => { id: string; name: string } | null
}) {
  const disposition = nameDisposition(side.disposition)?.name
  if (!side.mission) return <Answer value={side.dispositionChoices.length > 1 ? 'Choose a disposition' : 'No mission yet'} tone="quiet" />
  return <Answer value={side.mission.name} detail={disposition} />
}

function SecondariesAnswer({ side, ready }: { side: Side; ready: boolean }) {
  if (!ready) return <Answer value="After the armies" tone="quiet" />
  if (side.secondaryMode === 'fixed')
    return fixedHandShort(side) ? (
      <Answer value="Fixed" detail={`${side.secondaries.length} of ${FIXED_SECONDARIES} chosen`} tone="needed" />
    ) : (
      <Answer value="Fixed" detail={side.secondaries.map((card) => card.name).join(' · ')} />
    )
  return <Answer value="Tactical" detail={missionCardsReady(side) ? 'Drawn as the battle runs' : 'Dealing the deck'} />
}

function ReservesAnswer({ side }: { side: Side }) {
  const units = side.armies.flatMap((army) => attachedUnitList(army.units))
  if (!units.length) return <Answer value="No units yet" tone="quiet" />
  const held = units.filter((unit) => unit.host.formation !== 'battlefield').length
  return (
    <Answer
      value={held ? `${held} held back` : 'All on the table'}
      detail={`${units.length - held} of ${countLabel(units.length, 'unit')} deploy`}
    />
  )
}

function PrebattleAnswer({ side, rule }: { side: Side; rule: 'infiltrators' | 'scouts' }) {
  const { onTable, carrying } = prebattleCounts(side, rule)
  if (!onTable) return <Answer value="No units yet" tone="quiet" />
  return rule === 'infiltrators' ? (
    <Answer value={`${onTable} to deploy`} detail={carrying ? `${carrying} infiltrating` : 'None infiltrating'} />
  ) : (
    <Answer value={carrying ? countLabel(carrying, 'scout') : 'No moves'} detail="Before the first turn" />
  )
}
