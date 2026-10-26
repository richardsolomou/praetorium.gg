import { GuideHelp } from '../../onboarding/GuideHelp'
import type { RosterAttachment } from '../useCommand'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Command } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import {
  armyPointsFor,
  battlePointsBudget,
  evenArmyPoints,
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
import { gameReferencesQuery } from '../../../queries'
import { fixedHandShort, missionCardsReady, type Side, type SideMission, sideName, sideOf, sides as foldSides } from '../../../sides'
import type { SendCommand } from '../useCommand'
import { ClubChoice } from './ClubChoice'
import { SearchableSelect, type SearchableGroup } from '../../../components/SearchableSelect'
import { advanceOnboarding } from '../../onboarding/onboarding'
import { Battlefield } from './Battlefield'
import { ArmiesStep } from './ArmiesStep'
import { BATTLE_SIZE_CONTROL, CHOOSABLE, CHOSEN, SetupPanel, useDispositionNames } from './chrome'
import { TwistChoice } from './TwistChoice'
import { DefenderStep } from './DefenderStep'
import { FirstTurnStep } from './FirstTurnStep'
import { PrebattleUnits } from './PrebattleUnits'
import { SideDispositionChoice } from './SideDispositionChoice'
import { ReservesStep } from './ReservesStep'
import { SecondariesStep } from './SecondariesStep'
import { MissionDetailsDialog, type MissionDetails } from '../MissionCards'
import { tint } from '../battleTints'
import { TableStrip } from './TableStrip'
import { Choice } from '../../../components/Choice'
import { MANUAL_TRACKING_LIMITS } from '../manualTracking'
import { formatList } from '../../../text'
import { withMember } from '../../../../core/collections'

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
  /** Sections this device has opened past their one-line summary. Local, because reading is not a table decision. */
  const [opened, setOpened] = useState<SectionId[]>([])
  const isOpen = (id: SectionId) => opened.includes(id)
  const toggle = (id: SectionId) => setOpened((current) => withMember(current, id))
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

  const complete: Record<SectionId, boolean> = {
    armies: view.settings.limit !== null && ready && !budgetsDiffer && !armyProblem && !leaderless.length,
    mission: Boolean(mission) && !undecided.length,
    battlefield: Boolean(view.deploymentId),
    defender: Boolean(view.attackerId),
    secondaries: ready && !missingCards.length,
    reserves: ready,
    // Nothing is recorded for deployment; the first-turn roll-off that follows it closes it.
    deploy: Boolean(view.firstPlayerId),
    'first-turn': Boolean(view.firstPlayerId),
    'pre-battle': false,
  }

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
      clockLimitMinutes: null,
      ...(manual ? { manual: true } : {}),
      ...settings,
    })

  const sizeFixed = Boolean(view.leagueToken) || (view.settings.sizeFromRosters && format.problem !== 'manual')
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
  // The size and pack fold away once there is nothing to settle in them.
  const formatOpen = isOpen('armies') || !sizeFixed || (!manual && (!chosenPack || (references?.packs.length ?? 0) > 1))

  return (
    <main className="flex w-full flex-col">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-10">
        <header className="space-y-3">
          <div className="space-y-1 text-center">
            <h1 className="text-lg text-balance sm:text-xl">Set up the battle</h1>
            <GuideHelp task="battle" step="battle-setup-size">
              Battle setup guide
            </GuideHelp>
            <p className="text-sm text-dim">In the order the rules play it. Anyone at the table can answer for either side.</p>
            {manual ? <p className="text-sm text-discarded">Manual tracking. {MANUAL_TRACKING_LIMITS}</p> : null}
          </div>
          <TableStrip sides={table} />
        </header>

        <SetupSection
          id="armies"
          number={1}
          name="Armies"
          complete={complete.armies}
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
          needed={Boolean(owed.length || sizeProblem || leaderless.length)}
        >
          <ArmiesStep view={view} sides={table} send={send} attachRoster={attachRoster} pending={busy} problem={problem} />
          {view.leagueToken || manual ? null : <ClubChoice view={view} send={send} disabled={busy} />}
          <div data-onboarding="battle-setup-size">
            {formatOpen ? (
              <SetupPanel className="grid gap-4 sm:grid-cols-2">
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
                {references?.packs.length && !manual ? (
                  <fieldset>
                    <legend className="eyebrow">Mission pack</legend>
                    <div className="mt-1 grid gap-2">
                      {references.packs.map((pack) => (
                        <Button
                          key={pack.id}
                          variant="outline"
                          aria-pressed={view.settings.missionPackId === pack.id}
                          className={`h-auto justify-start px-3 py-2 text-left text-sm font-bold uppercase ${
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
              </SetupPanel>
            ) : (
              <FoldedLine
                summary={
                  <>
                    <span className="font-bold uppercase">{sizeName}</span>
                    <span className="text-dim"> · {manual ? 'Manual tracking' : chosenPack?.name}</span>
                  </>
                }
                actionLabel={manual ? 'Change battle size and tracking' : 'Change battle size and mission pack'}
                onAction={() => toggle('armies')}
              />
            )}
          </div>
        </SetupSection>

        <SetupSection
          skipped={manual}
          id="mission"
          locked={!youHaveAnArmy}
          number={2}
          name="Mission"
          complete={complete.mission}
          needed={youHaveAnArmy && undecided.length > 0}
          hint={
            !youHaveAnArmy
              ? 'Choose your army to see the missions.'
              : undecided.length
                ? 'Choose the Force Disposition each allied side plays.'
                : 'Each side plays the primary listed against its opponent’s Force Disposition.'
          }
        >
          {youHaveAnArmy ? (
            <>
              <div data-onboarding="battle-setup-mission" className="grid items-start gap-6 sm:grid-cols-2">
                {table.map((side) => {
                  const card = side.mission ? primaryCardFor(side.mission.id) : undefined
                  return (
                    <div key={side.index} className={`min-w-0 space-y-3 border-t-[3px] pt-3 ${tint(side.index).edge}`}>
                      <p className="sr-only">{sideName(side)}</p>
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
                    </div>
                  )
                })}
              </div>
              {reading ? <MissionDetailsDialog details={reading} onOpenChange={(open) => !open && setReading(null)} /> : null}
              {twists.length ? (
                isOpen('mission') ? (
                  <TwistChoice
                    twists={twists}
                    chosenId={view.settings.twistId}
                    disabled={busy}
                    onChoose={(twistId) => configure({ twistId })}
                  />
                ) : (
                  <FoldedLine
                    summary={
                      <>
                        <span className="eyebrow mr-2">Twist</span>
                        <span className="font-bold uppercase">{twist?.name ?? 'No twist'}</span>
                      </>
                    }
                    actionLabel="Change the mission twist"
                    onAction={() => toggle('mission')}
                  />
                )
              ) : null}
            </>
          ) : null}
        </SetupSection>

        <SetupSection
          skipped={manual}
          id="battlefield"
          locked={!ready || (!kotc && !complete.mission)}
          number={3}
          name="Battlefield"
          complete={complete.battlefield}
          needed={youHaveAnArmy && !view.deploymentId}
          hint={
            kotc
              ? 'The terrain and objectives always go in the same places.'
              : view.deploymentId
                ? 'One shared choice sets the deployment zones and the terrain for both sides.'
                : 'Choose a layout. It sets the deployment zones and the terrain for both sides.'
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
        </SetupSection>

        <SetupSection
          skipped={manual}
          id="defender"
          locked={!complete.armies}
          number={4}
          name="Defender"
          complete={complete.defender}
          needed={complete.armies && !view.attackerId}
          hint={
            complete.armies
              ? 'Roll off. The winner chooses the defender, who deploys first.'
              : 'Once the armies are chosen, roll off. The winner chooses the defender.'
          }
        >
          {complete.armies ? <DefenderStep sides={table} attackerId={view.attackerId} disabled={busy} send={send} /> : null}
        </SetupSection>

        <SetupSection
          skipped={manual}
          id="secondaries"
          locked={!ready}
          number={5}
          name="Secondaries"
          complete={complete.secondaries}
          needed={youHaveAnArmy && ready && missingCards.length > 0}
          hint={
            ready && missingCards.length
              ? 'Waiting for every side’s mission cards.'
              : 'Tactical cards are dealt as the battle runs. Fixed cards are chosen now and played all game.'
          }
        >
          {youHaveAnArmy ? <SecondariesStep view={view} sides={table} send={send} pending={pending} /> : null}
        </SetupSection>

        <SetupSection
          skipped={manual}
          id="reserves"
          locked={!youHaveAnArmy}
          number={6}
          name="Reserves"
          complete={complete.reserves}
          hint="Every unit starts on the battlefield unless its side holds it back in reserves, deep strike or a transport."
        >
          {youHaveAnArmy ? (
            <ReservesStep view={view} sides={table} send={sendCommand} problem={problem} sentFrom={reserveRow} onSent={setReserveRow} />
          ) : null}
        </SetupSection>

        <SetupSection
          skipped={manual}
          id="deploy"
          number={7}
          name="Deploy"
          complete={complete.deploy}
          locked={!view.deploymentId || !view.attackerId}
          onboarding="battle-setup-deploy"
          hint={`Sides alternate setting up one unit at a time${defender ? `, ${sideName(defender)} first` : ''}. Units in strategic reserves stay off the table.`}
        >
          {youHaveAnArmy ? <PrebattleUnits sides={table} rule="infiltrators" empty="No unit sets up outside the deployment zone." /> : null}
        </SetupSection>

        <SetupSection
          id="first-turn"
          locked={manual ? !complete.armies : !view.deploymentId || !view.attackerId}
          number={manual ? 2 : 8}
          name="First turn"
          complete={complete['first-turn']}
          needed={(manual ? complete.armies : Boolean(view.deploymentId && view.attackerId)) && !view.firstPlayerId}
          hint={
            manual
              ? 'Roll off. The winner takes the first turn.'
              : 'Once both armies are deployed, roll off. The winner takes the first turn.'
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
        </SetupSection>

        <SetupSection
          skipped={manual}
          id="pre-battle"
          locked={!firstSide}
          number={9}
          name="Pre-battle rules"
          complete={complete['pre-battle']}
          hint={`Sides alternate resolving pre-battle rules${firstSide ? `, ${sideName(firstSide)} first` : ''}. Start battle opens the first Command phase.`}
        >
          {youHaveAnArmy ? <PrebattleUnits sides={table} rule="scouts" empty="No unit has a pre-battle move." /> : null}
        </SetupSection>

        <div data-setup-bar className="flex items-center justify-between gap-3 border-t border-edge pt-6">
          <div className="min-w-0" aria-live="polite">
            {problem && !reserveRow ? (
              <p className="line-clamp-2 text-sm text-destructive">{problem}</p>
            ) : remaining.length ? (
              <>
                <p className="text-xs font-bold text-discarded uppercase">{remaining.length} left</p>
                <p className="truncate text-xs text-dim">{remaining.join(' · ')}</p>
              </>
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
    </main>
  )
}

/** One section of the page: a numbered heading, what it asks or is waiting on, and its controls. */
function SetupSection({
  skipped = false,
  id,
  number,
  name,
  complete,
  locked = false,
  needed = false,
  hint,
  onboarding,
  children,
}: {
  /** Absent from a battle that does not play this section, such as a manually tracked one. */
  skipped?: boolean
  id: SectionId
  number: number
  name: string
  complete: boolean
  locked?: boolean
  /** Whether the hint names something the table still owes, rather than describing the section. */
  needed?: boolean
  hint?: string
  onboarding?: 'battle-setup-deploy'
  children: ReactNode
}) {
  if (skipped) return null
  return (
    <section
      id={`setup-${id}`}
      data-onboarding={onboarding}
      data-locked={locked}
      data-complete={complete}
      aria-labelledby={`setup-${id}-title`}
      className={`scroll-mt-header! space-y-4 rounded-lg border border-edge bg-panel p-4 transition-opacity sm:p-5 ${locked ? 'opacity-40' : ''}`}
    >
      <div className="space-y-1 border-b border-edge pb-1.5">
        <h2 id={`setup-${id}-title`} className="flex items-center gap-2 text-base">
          <span
            className={`readout grid size-5 shrink-0 place-items-center rounded-full text-3xs font-bold ${
              complete ? 'bg-achieved text-void' : 'border border-edge-strong text-dim'
            }`}
            aria-hidden
          >
            {complete ? <Check className="size-3" /> : number}
          </span>
          {name}
        </h2>
        {hint ? <p className={`text-sm ${needed ? 'text-discarded' : 'text-dim'}`}>{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** A section's settled answer on one line, with the control that opens it. */
function FoldedLine({ summary, actionLabel, onAction }: { summary: ReactNode; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-edge bg-panel px-3 py-2">
      <p className="min-w-0 text-sm">{summary}</p>
      <Button variant="outline" size="sm" className="shrink-0" aria-label={actionLabel} onClick={onAction}>
        Change
      </Button>
    </div>
  )
}
