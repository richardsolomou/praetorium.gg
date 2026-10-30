import { GuideHelp } from '../../onboarding/GuideHelp'
import type { RosterAttachment } from '../useCommand'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown } from 'lucide-react'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Command } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import {
  armyPointsFor,
  sharedSidePoints,
  battlePointsBudget,
  evenArmyPoints,
  FIXED_SECONDARIES,
  battleSizeLabel,
  battleSizeOptionLabel,
  battleSizeText,
  GAME_SIZES,
  isKotcLimit,
  pointsBudgetsAgree,
  rosterBattleFormat,
  teamArmyProblems,
} from '../../../../core/battle'
import { ArmyPoints } from './ArmyPoints'
import { battleClubsQuery, deploymentsQuery, gameReferencesQuery } from '../../../queries'
import { fixedHandShort, missionCardsReady, type Side, type SideMission, sideName, sideOf, sides as foldSides } from '../../../sides'
import type { SendCommand } from '../useCommand'
import { ClubChoice } from './ClubChoice'
import { SearchableSelect, type SearchableGroup } from '../../../components/SearchableSelect'
import { advanceOnboarding } from '../../onboarding/onboarding'
import { Battlefield } from './Battlefield'
import { ArmiesStep } from './ArmiesStep'
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
import { prebattleCounts, PrebattleUnits } from './PrebattleUnits'
import { SideDispositionChoice } from './SideDispositionChoice'
import { ReservesStep } from './ReservesStep'
import { SecondariesStep } from './SecondariesStep'
import { MissionDetailsDialog, type MissionDetails } from '../MissionCards'
import { tint } from '../battleTints'
import { SidePlayers } from '../PlayerName'
import type { OnboardingTarget } from '../../../onboardingTargets'
import { attachedUnitList } from '../../../../core/attachedUnits'
import { Choice } from '../../../components/Choice'
import { MANUAL_TRACKING_LIMITS } from '../manualTracking'
import { formatList } from '../../../text'

type Props = {
  view: BattleView
  mission: { id: string; name: string; deploymentIds: string[] } | null
  /** Every side's matchup, so a side the table plays settles its cards from its own. */
  missions: { side: number; mission: SideMission | null }[]
  send: SendCommand
  attachRoster: (command: RosterAttachment) => Promise<boolean>
  pending: boolean
  problem: string | null
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

const SECTION_IDS = [
  'format',
  'armies',
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
const BUDGET_MISMATCH = 'Choose rosters with the same points budget for each side. Allies split the points evenly.'

/**
 * Setting the table on one page, in the order the rules set it.
 *
 * Every answer is folded from the battle log, so both devices read the same page and
 * the same list of what is left; where each device is scrolled is its own.
 */
export function Setup({ view, mission, missions, send: sendCommand, attachRoster, pending, problem }: Props) {
  const table = foldSides(view, missions)
  const manual = view.settings.manual === true
  const yours = table.find((side) => side.isViewer)
  const { data: references } = useQuery(gameReferencesQuery())
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: clubs } = useQuery(battleClubsQuery(view.token))
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
    sendCommand(command, options)
  }
  /** The mission card a matchup panel has been asked to read out, if any. */
  const [reading, setReading] = useState<MissionDetails | null>(null)
  /**
   * Steps this device has opened or folded by hand. Local, because reading is not a table
   * decision; a step nobody has touched is open exactly while it still needs an answer.
   */
  const [folding, setFolding] = useState<Partial<Record<SectionId, boolean>>>({})
  /** The side a phone shows in steps that list both, starting on the viewer's own. */
  const [focusedSide, setFocusedSide] = useState<number | null>(null)
  const attached = view.players.filter((player) => player.roster).length
  const ready = attached === view.players.length
  const format = rosterBattleFormat(view)
  const youHaveAnArmy = Boolean(yours?.armies.find((army) => army.isViewer)?.roster)
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
  const budgetsDiffer = ready && !team && !pointsBudgetsAgree(view)
  const armyProblem = ready ? teamArmyProblems(view)[0] : undefined
  const sizeProblem =
    view.settings.limit !== null
      ? budgetsDiffer
        ? BUDGET_MISMATCH
        : armyProblem
          ? `${sideName(table.find((side) => side.index === armyProblem.side)!)}: ${
              armyProblem.code === 'allies-mismatch'
                ? 'choose lists saved to the same points total.'
                : sharedSidePoints(view, armyProblem.side) !== null
                  ? `allies spend more than their ${sharedSidePoints(view, armyProblem.side)!.toLocaleString('en')} points.`
                  : `an army spends more than its ${armyPointsFor(view, armyProblem.side)?.toLocaleString('en')} points.`
            }`
          : null
      : !ready
        ? null
        : view.settings.sizeFromRosters
          ? format.problem === 'manual'
            ? 'Choose a battle size for text-only armies.'
            : format.problem === 'unsupported'
              ? 'These roster formats do not make a supported battle size. Choose another format; allies split the points evenly.'
              : format.problem === 'budget-mismatch'
                ? BUDGET_MISMATCH
                : 'Choose matching roster formats for each side. Allies split the points evenly.'
          : 'Choose a battle size to continue.'

  /**
   * Everything the battle still needs before it can begin, in rules order. The summary
   * beside Start battle and the button itself both read this one list.
   */
  const remaining = [
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
    if (ready) advanceOnboarding('battle', 'battle-setup-armies', 'battle-setup-mission')
  }, [ready])
  useEffect(() => {
    if (view.deploymentId) advanceOnboarding('battle', 'battle-setup-battlefield', 'battle-setup-defender')
  }, [view.deploymentId])
  useEffect(() => {
    if (view.attackerId) advanceOnboarding('battle', 'battle-setup-defender', 'battle-setup-secondaries')
  }, [view.attackerId])
  useEffect(() => {
    if (view.firstPlayerId) advanceOnboarding('battle', 'battle-setup-first', 'battle-setup-begin')
  }, [view.firstPlayerId])

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
      armyPoints: view.settings.armyPoints ?? null,
      ...(view.settings.sharedArmyPoints ? { sharedArmyPoints: true } : {}),
      clockLimitMinutes: null,
      ...(manual ? { manual: true } : {}),
      ...settings,
    })

  const sizeFixed = Boolean(view.leagueToken || (view.settings.sizeFromRosters && format.problem !== 'manual'))
  const sizeName =
    view.settings.limit === null
      ? 'Determined by your rosters'
      : team
        ? battleSizeText(view)!
        : pointsBudget === null
          ? battleSizeOptionLabel({
              name: GAME_SIZES.find((size) => size.limit === view.settings.limit)?.name ?? 'Battle',
              limit: view.settings.limit,
            })
          : battleSizeLabel(view.settings.limit, pointsBudget)
  const complete: Record<SectionId, boolean> = {
    format: (view.settings.limit !== null || sizeFixed) && (manual || Boolean(chosenPack)),
    armies: view.settings.limit !== null && ready && !budgetsDiffer && !armyProblem && !leaderless.length,
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
  const locked: Record<SectionId, boolean> = {
    format: false,
    armies: false,
    mission: !youHaveAnArmy,
    battlefield: !ready || (!kotc && !complete.mission),
    defender: !complete.armies,
    secondaries: !ready,
    reserves: !youHaveAnArmy,
    deploy: !view.deploymentId || !view.attackerId,
    'first-turn': manual ? !complete.armies : !view.deploymentId || !view.attackerId,
    'pre-battle': !firstSide,
  }
  /*
   * A step whose default is already a valid answer — the missions the armies imply, Tactical
   * secondaries, every unit on the battlefield, no pre-battle moves — owes nothing but has not been answered
   * either, so its number is a checkbox the table ticks itself, kept in the log for every device.
   */
  const checked = (id: SectionId) => (view.setupChecked ?? []).includes(SECTION_IDS.indexOf(id))
  const settled: Record<SectionId, boolean> = {
    ...complete,
    mission: complete.mission && checked('mission'),
    secondaries: complete.secondaries && checked('secondaries'),
    reserves: complete.reserves && checked('reserves'),
    deploy: complete.deploy && checked('deploy'),
    'pre-battle': complete['pre-battle'] && checked('pre-battle'),
  }
  const fold = (id: SectionId, open: boolean) => setFolding((current) => ({ ...current, [id]: open }))
  const land = (id: SectionId | undefined) => id && landOn(document.getElementById(`setup-${id}`))
  /** Ticks or clears a defaulted step for the whole table, which folds or opens it here too. */
  const check = (id: SectionId) => ({
    checked: settled[id],
    disabled: busy || locked[id] || !complete[id],
    onCheck: () => {
      const ticking = !settled[id]
      // Folded here at once, then left to the log, so a tick from another device still folds or opens it.
      fold(id, !ticking)
      send(
        { kind: 'set-setup-checked', step: SECTION_IDS.indexOf(id), checked: ticking },
        { complete: () => setFolding((current) => ({ ...current, [id]: undefined })) },
      )
      if (ticking) land(SECTION_IDS.slice(SECTION_IDS.indexOf(id) + 1).find((later) => !(manual && MANUAL_SKIPS.has(later))))
    },
  })
  const isOpen = (id: SectionId) => folding[id] ?? (!locked[id] && !settled[id])
  const toggle = (id: SectionId) => {
    const closing = isOpen(id)
    // Folded from its header held at the top of the screen, the step comes back to where it starts.
    const scrolledPast = (document.getElementById(`setup-${id}`)?.getBoundingClientRect().top ?? 0) < 0
    fold(id, !closing)
    if (closing && scrolledPast) land(id)
  }
  /** The first step the table still owes an answer to, which the bar takes the reader to. */
  const next = SECTION_IDS.find((id) => !locked[id] && !complete[id] && !NOTHING_OWED.has(id) && !(manual && MANUAL_SKIPS.has(id)))
  const step = (id: SectionId) => ({
    id,
    complete: complete[id],
    settled: settled[id],
    locked: locked[id],
    current: next === id,
    open: isOpen(id),
    onToggle: () => toggle(id),
  })
  const deployment = deployments?.find((pattern) => pattern.id === view.deploymentId)
  const club = clubs?.current?.name

  return (
    <main className="flex w-full flex-col">
      <SideFocusProvider value={{ side: focusedSide ?? yours?.index ?? 0, show: setFocusedSide }}>
        <div className="mx-auto w-full max-w-5xl px-3 pt-6 sm:px-4">
          <header className="space-y-5">
            <div className="space-y-1 text-center">
              <h1 className="text-lg text-balance sm:text-xl">Set up the battle</h1>
              <p className="text-sm text-dim">In the order the rules play it. Anyone at the table can answer for either side.</p>
              <GuideHelp task="battle" step="battle-setup-size">
                Battle setup guide
              </GuideHelp>
              {manual ? <p className="text-sm text-discarded">Manual tracking. {MANUAL_TRACKING_LIMITS}</p> : null}
            </div>
            <FaceOff sides={table} />
          </header>

          <ol className="mt-8">
            <SpineStep
              {...step('format')}
              number={1}
              name="Format"
              onboarding="battle-setup-size"
              needed={!complete.format}
              hint={complete.format ? undefined : 'Choose the battle size and how this battle is tracked.'}
              summary={
                <SharedAnswer>
                  <span className="font-bold uppercase">{sizeName}</span>
                  <span className="text-dim">
                    {' '}
                    · {manual ? 'Manual tracking' : (chosenPack?.name ?? 'Guided')}
                    {club ? ` · ${club}` : ''}
                  </span>
                </SharedAnswer>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  {sizeFixed ? (
                    <>
                      <p className="eyebrow">Battle size</p>
                      <p className="mt-1 flex min-h-11 items-center rounded-lg border border-input bg-input/30 px-3 py-2 text-sm font-bold uppercase">
                        {sizeName}
                      </p>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
                {references?.packs.length && !manual ? (
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
                {team && view.settings.limit !== null && !view.leagueToken ? (
                  <ArmyPoints
                    sides={table}
                    defaults={[0, 1].map((side) => evenArmyPoints(view, side)!)}
                    chosen={view.settings.armyPoints}
                    disabled={busy}
                    onChange={(armyPoints) => configure({ armyPoints })}
                  />
                ) : null}
                {view.leagueToken ? null : (
                  <div className="sm:col-span-2">
                    <Choice
                      label="Tracking"
                      value={manual ? 'manual' : 'guided'}
                      options={[
                        { value: 'guided', name: 'Guided', detail: 'Mission cards, scoring prompts and caps' },
                        { value: 'manual', name: 'Manual', detail: 'Keep score yourself' },
                      ]}
                      columns={2}
                      disabled={busy}
                      onChange={(tracking) =>
                        configure(
                          tracking === 'manual'
                            ? { manual: true, missionPackId: null, twistId: null, terrainLayoutId: null }
                            : { manual: false, missionPackId: references?.packs[0]?.id ?? null },
                        )
                      }
                    />
                  </div>
                )}
                {view.leagueToken || manual ? null : (
                  <div className="sm:col-span-2">
                    <ClubChoice view={view} send={send} disabled={busy} />
                  </div>
                )}
              </div>
            </SpineStep>

            <SpineStep
              {...step('armies')}
              number={2}
              name="Armies"
              onboarding="battle-setup-armies"
              sides={table}
              renderSide={(side) => <ArmyAnswer side={side} manual={manual} />}
              needed={Boolean(owed.length || sizeProblem || leaderless.length)}
              hint={
                owed.length
                  ? `Choose an army for ${formatList(owed.map((army) => army.playerName))}.`
                  : awaited.length
                    ? `Waiting for ${formatList(awaited.map((army) => army.playerName))} to choose an army.`
                    : (sizeProblem ??
                      (leaderless.length ? 'Choose whose Warlord leads each allied side.' : null) ??
                      (team
                        ? 'The biggest list sets the battle size. Each army spends up to its side’s points per army, and allies bring lists saved to the same total.'
                        : 'Battle size follows your rosters. Each side brings the same points.'))
              }
            >
              <ArmiesStep view={view} sides={table} send={send} attachRoster={attachRoster} pending={busy} problem={problem} />
            </SpineStep>

            <SpineStep
              {...step('mission')}
              check={check('mission')}
              skipped={manual}
              number={3}
              name="Mission"
              onboarding="battle-setup-mission"
              sides={table}
              renderSide={(side) => <MissionAnswer side={side} nameDisposition={nameDisposition} />}
              needed={youHaveAnArmy && undecided.length > 0}
              hint={
                !youHaveAnArmy
                  ? 'Choose your army to see the missions.'
                  : undecided.length
                    ? 'Choose the Force Disposition each allied side plays.'
                    : twists.length
                      ? `Each side plays the primary listed against its opponent’s Force Disposition. ${twist ? `Twist: ${twist.name}.` : 'No twist.'}`
                      : 'Each side plays the primary listed against its opponent’s Force Disposition.'
              }
            >
              {youHaveAnArmy ? (
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
              skipped={manual}
              number={4}
              name="Battlefield"
              onboarding="battle-setup-battlefield"
              needed={youHaveAnArmy && !view.deploymentId}
              hint={
                kotc
                  ? 'The terrain and objectives always go in the same places.'
                  : view.deploymentId
                    ? 'One shared choice sets the deployment zones and the terrain for both sides.'
                    : 'Choose a layout. It sets the deployment zones and the terrain for both sides.'
              }
              summary={
                <SharedAnswer>
                  {deployment ? (
                    <span className="font-bold uppercase">{deployment.name}</span>
                  ) : (
                    <span className="text-dim">No layout yet</span>
                  )}
                </SharedAnswer>
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
              skipped={manual}
              number={5}
              name="Defender"
              onboarding="battle-setup-defender"
              needed={complete.armies && !view.attackerId}
              hint={
                complete.armies
                  ? 'Roll off. The winner chooses the defender, who deploys first.'
                  : 'Once the armies are chosen, roll off. The winner chooses the defender.'
              }
              summary={
                <SharedAnswer>
                  {defender ? (
                    <>
                      <span className={`font-bold uppercase ${tint(defender.index).text}`}>{sideName(defender)}</span>
                      <span className="text-dim"> defends · deploys first</span>
                    </>
                  ) : (
                    <span className="text-dim">Not rolled yet</span>
                  )}
                </SharedAnswer>
              }
            >
              {complete.armies ? <DefenderStep sides={table} attackerId={view.attackerId} disabled={busy} send={send} /> : null}
            </SpineStep>

            <SpineStep
              {...step('secondaries')}
              check={check('secondaries')}
              skipped={manual}
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
              skipped={manual}
              number={7}
              name="Reserves"
              onboarding="battle-setup-reserves"
              sides={table}
              renderSide={(side) => <ReservesAnswer side={side} />}
              hint="Every unit starts on the battlefield unless its side holds it back in reserves, deep strike or a transport."
            >
              {youHaveAnArmy ? (
                <ReservesStep view={view} sides={table} send={sendCommand} problem={problem} sentFrom={reserveRow} onSent={setReserveRow} />
              ) : null}
            </SpineStep>

            <SpineStep
              {...step('deploy')}
              check={check('deploy')}
              skipped={manual}
              number={8}
              name="Deploy"
              onboarding="battle-setup-deploy"
              sides={table}
              renderSide={(side) => <PrebattleAnswer side={side} rule="infiltrators" />}
              hint={`Sides alternate setting up one unit at a time${defender ? `, ${sideName(defender)} first` : ''}. Units in strategic reserves stay off the table.`}
            >
              {youHaveAnArmy ? (
                <PrebattleUnits sides={table} rule="infiltrators" empty="No unit sets up outside the deployment zone." />
              ) : null}
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
                <SharedAnswer>
                  {firstSide ? (
                    <>
                      <span className={`font-bold uppercase ${tint(firstSide.index).text}`}>{sideName(firstSide)}</span>
                      <span className="text-dim"> takes the first turn</span>
                    </>
                  ) : (
                    <span className="text-dim">Not rolled yet</span>
                  )}
                </SharedAnswer>
              }
            >
              {manual || view.deploymentId ? (
                <FirstTurnStep
                  sides={table}
                  first={firstSide?.index ?? null}
                  disabled={busy || (manual ? !complete.armies : !view.attackerId)}
                  send={send}
                />
              ) : null}
            </SpineStep>

            <SpineStep
              {...step('pre-battle')}
              check={check('pre-battle')}
              skipped={manual}
              number={10}
              name="Pre-battle rules"
              sides={table}
              renderSide={(side) => <PrebattleAnswer side={side} rule="scouts" />}
              hint={`Sides alternate resolving pre-battle rules${firstSide ? `, ${sideName(firstSide)} first` : ''}. Start battle opens the first Command phase.`}
            >
              {youHaveAnArmy ? <PrebattleUnits sides={table} rule="scouts" empty="No unit has a pre-battle move." /> : null}
            </SpineStep>
          </ol>
          {reading ? <MissionDetailsDialog details={reading} onOpenChange={(open) => !open && setReading(null)} /> : null}
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
            <Button
              data-onboarding="battle-setup-begin"
              className="h-11 shrink-0 px-5 text-base"
              disabled={pending || remaining.length > 0 || !firstSide}
              onClick={() => {
                if (firstSide) send({ kind: 'begin-battle', firstPlayerId: firstSide.captain.id, attackerId: view.attackerId ?? undefined })
              }}
            >
              Start battle
            </Button>
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

/** Who is playing whom, facing each other across the spine every step below hangs from. */
function FaceOff({ sides }: { sides: Side[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-stretch">
      {sides.map((side, position) => {
        const armies = side.armies.flatMap((army) => (army.roster ? [army.roster.name] : []))
        const points = side.armies.reduce((total, army) => total + (army.roster?.built ? (army.points ?? 0) : 0), 0)
        return (
          <Fragment key={side.index}>
            {position ? (
              <span aria-hidden className="grid place-items-center font-display text-sm font-bold text-faint">
                VS
              </span>
            ) : null}
            <div
              className={cn(
                'flex min-w-0 flex-col gap-1.5 border-t-[3px] pt-2.5',
                tint(side.index).edge,
                position && 'items-end text-right',
              )}
            >
              <SidePlayers side={side} className={position ? 'justify-end' : ''} />
              <span
                className={cn(
                  'max-w-full font-display text-base leading-tight font-bold break-words uppercase sm:text-2xl',
                  !armies.length && 'text-dim',
                )}
              >
                {armies.length ? armies.join(' & ') : 'No army yet'}
              </span>
              {points ? <span className="figure text-xs text-dim">{points.toLocaleString('en')} pts</span> : null}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

/**
 * One step of setup, hung from the spine.
 *
 * Its heading sits on the spine and opens or folds it. Folded, it reads as its answer:
 * one line on the spine for a choice the table shares, or a cell either side of it for
 * one each side makes. A step nobody has touched on this device is open until it is
 * settled, so the page condenses as the table works down it.
 */
function SpineStep({
  skipped = false,
  id,
  number,
  name,
  complete,
  settled,
  locked,
  current,
  open,
  onToggle,
  needed = false,
  hint,
  onboarding,
  sides,
  renderSide,
  summary,
  check,
  children,
}: {
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
  open: boolean
  onToggle: () => void
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
  const shown = open && Boolean(children)
  return (
    <li className="list-none">
      <section
        id={`setup-${id}`}
        data-onboarding={onboarding}
        data-locked={locked}
        data-complete={complete}
        data-open={shown}
        aria-labelledby={`setup-${id}-title`}
        className={cn('relative scroll-mt-(--app-header)! pb-10 transition-opacity', locked && 'opacity-40')}
      >
        {/* The spine through this step, drawn in once the step is settled. */}
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2', settled ? 'bg-achieved/50' : 'bg-edge-strong')}
        />
        {/* Held under the app header while the step's body scrolls past, so its tick stays in reach. */}
        <div className="sticky top-(--app-header) z-10 flex justify-center bg-void/95 backdrop-blur">
          <div className="inline-flex items-center px-1">
            {/* Outside the heading, so the step is still named by its title alone. */}
            {check ? (
              <label
                title={check.checked ? `Mark ${name} not done` : `Mark ${name} done`}
                className="group/check grid size-11 shrink-0 cursor-pointer place-items-center has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-offset-[-4px] has-focus-visible:outline-primary"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  aria-label={`${name} done`}
                  checked={check.checked}
                  disabled={check.disabled}
                  onChange={check.onCheck}
                />
                <StepMark settled={settled} current={current} number={number} checkable={!check.disabled} />
              </label>
            ) : (
              <span aria-hidden className="grid size-11 shrink-0 place-items-center">
                <StepMark settled={settled} current={current} number={number} checkable={false} />
              </span>
            )}
            <h2 id={`setup-${id}-title`} className="text-base">
              <button
                type="button"
                aria-expanded={shown}
                aria-controls={`setup-${id}-body`}
                disabled={!children}
                className="inline-flex min-h-11 items-center gap-2.5 pr-2 uppercase transition-colors enabled:hover:text-bone disabled:cursor-default"
                onClick={onToggle}
              >
                <span className={current ? 'text-discarded' : undefined}>{name}</span>
                {children ? (
                  <ChevronDown aria-hidden className={cn('size-4 text-dim transition-transform duration-200', shown && 'rotate-180')} />
                ) : null}
              </button>
            </h2>
          </div>
        </div>
        {hint ? (
          <p
            className={cn(
              'relative mx-auto mt-1 w-fit max-w-md bg-void px-3 text-center text-sm text-balance',
              needed ? 'text-discarded' : 'text-dim',
            )}
          >
            {hint}
          </p>
        ) : null}
        <div id={`setup-${id}-body`} className="relative mt-4">
          {shown ? (
            <div className="border border-edge bg-panel">
              {sides && renderSide ? <SideSwitch sides={sides} renderSide={renderSide} /> : null}
              <div className="space-y-4 p-3 sm:p-4">
                {children}
                {sides ? <SideSwitchNext sides={sides} /> : null}
              </div>
            </div>
          ) : sides && renderSide ? (
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-start">
              {sides.map((side, position) => (
                <div
                  key={side.index}
                  className={cn(
                    'min-w-0 border-t-2 pt-2 text-sm',
                    tint(side.index).edge,
                    position ? 'col-start-3 text-right' : 'col-start-1',
                  )}
                >
                  {renderSide(side)}
                </div>
              ))}
            </div>
          ) : (
            summary
          )}
        </div>
      </section>
    </li>
  )
}

/** A step's number on the spine, or its tick once settled; a checkbox's box when the table ticks it. */
function StepMark({ settled, current, number, checkable }: { settled: boolean; current: boolean; number: number; checkable: boolean }) {
  return (
    <span
      className={cn(
        'readout grid size-7 place-items-center border-2 text-xs font-bold transition-colors',
        settled
          ? 'border-achieved bg-achieved text-void'
          : current
            ? 'border-discarded bg-void text-discarded'
            : 'border-edge-strong bg-void text-dim',
        checkable && !settled && 'group-hover/check:border-achieved group-hover/check:text-achieved',
      )}
    >
      {settled ? <Check className="size-4" strokeWidth={3} /> : number}
    </span>
  )
}

/** A choice the table shares, written on the spine. */
function SharedAnswer({ children }: { children: ReactNode }) {
  return <p className="mx-auto w-fit max-w-full border border-edge bg-panel px-3 py-2 text-center text-sm text-balance">{children}</p>
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

function ArmyAnswer({ side, manual }: { side: Side; manual: boolean }) {
  const chosen = side.armies.filter((army) => army.roster)
  if (!chosen.length) {
    const yours = side.armies.some((army) => army.isViewer || army.automated)
    return <Answer value={yours ? 'Choose an army' : 'Waiting'} tone={yours ? 'needed' : 'quiet'} />
  }
  const units = chosen.reduce((total, army) => total + army.unitCount, 0)
  return (
    <Answer
      value={`${units} ${units === 1 ? 'unit' : 'units'}`}
      detail={
        chosen.length < side.armies.length
          ? `${side.armies.length - chosen.length} army still to choose`
          : manual
            ? undefined
            : side.paintedPoints
              ? `Battle ready · +${side.paintedPoints} VP`
              : 'Not battle ready'
      }
    />
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
    <Answer value={held ? `${held} held back` : 'All on the table'} detail={`${units.length - held} of ${units.length} units deploy`} />
  )
}

function PrebattleAnswer({ side, rule }: { side: Side; rule: 'infiltrators' | 'scouts' }) {
  const { onTable, carrying } = prebattleCounts(side, rule)
  if (!onTable) return <Answer value="No units yet" tone="quiet" />
  return rule === 'infiltrators' ? (
    <Answer value={`${onTable} to deploy`} detail={carrying ? `${carrying} infiltrating` : 'None infiltrating'} />
  ) : (
    <Answer value={carrying ? `${carrying} scout${carrying === 1 ? '' : 's'}` : 'No moves'} detail="Before the first turn" />
  )
}
