import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Command } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import { FIXED_SECONDARIES, GAME_SIZES, isKotcLimit, rosterBattleFormat } from '../../../../core/battle'
import { deploymentsQuery, gameReferencesQuery } from '../../../queries'
import { deploymentFor } from '../../../battleSummary'
import { missionCardsReady, type Side, type SideMission, sideName, sides as foldSides } from '../../../sides'
import type { SendCommand } from '../useCommand'
import { SearchableSelect, type SearchableGroup } from '../../../components/SearchableSelect'
import { advanceOnboarding } from '../../onboarding/onboarding'
import { Battlefield } from './Battlefield'
import { ArmiesStep } from './ArmiesStep'
import { CHOOSABLE, CHOSEN, DispositionChip, SetupPanel, useDispositionNames } from './chrome'
import { TwistChoice } from './TwistChoice'
import { DefenderStep } from './DefenderStep'
import { FirstTurnStep } from './FirstTurnStep'
import { DeployStep } from './DeployStep'
import { PreBattleRulesStep } from './PreBattleRulesStep'
import { SideDispositionChoice } from './SideDispositionChoice'
import { ReservesStep } from './ReservesStep'
import { SecondariesStep } from './SecondariesStep'
import { SidePlayers } from '../PlayerName'
import { StepRail, type RailStep } from './StepRail'
import { MissionDetailsDialog, type MissionDetails } from '../MissionCards'
import { CARD_NAME, tint } from '../battleTints'
import { TableStrip } from './TableStrip'

type Props = {
  view: BattleView
  mission: { id: string; name: string; deploymentIds: string[] } | null
  /** Every side's matchup, so a side the table plays settles its cards from its own. */
  missions: { side: number; mission: SideMission | null }[]
  send: SendCommand
  attachSavedRoster: (rosterId: string, playerId?: string) => Promise<boolean>
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

/** Every matched-play size, named and priced, for the one control that asks for it. */
const SIZE_OPTIONS: SearchableGroup[] = [
  { label: '', items: GAME_SIZES.map((size) => ({ label: `${size.name} · ${size.limit}`, value: String(size.limit) })) },
]

/**
 * Setting the table, in the order the rules set it.
 *
 * The section is folded from the battle log, so moving through setup moves every
 * seated device at once — it is one conversation across the table rather than five
 * private wizards that have to be reconciled at the end.
 */
export function Setup({ view, mission, missions, send, attachSavedRoster, pending, problem }: Props) {
  const table = foldSides(view, missions)
  const yours = table.find((side) => side.isViewer)
  const { data: references } = useQuery(gameReferencesQuery())
  // Logs from battles already in setup can still point at the former Armies section.
  const at = Math.max(0, view.setupStep - 1)
  useEffect(() => {
    if (at === 1) advanceOnboarding('battle', 'battle-setup-armies', 'battle-setup-mission')
    if (at === 2) advanceOnboarding('battle', 'battle-setup-mission', 'battle-setup-battlefield')
    if (at === 3) advanceOnboarding('battle', 'battle-setup-battlefield', 'battle-setup-defender')
    if (at === 4) advanceOnboarding('battle', 'battle-setup-defender', 'battle-setup-secondaries')
    if (at === 5) advanceOnboarding('battle', 'battle-setup-secondaries', 'battle-setup-reserves')
    if (at === 6) advanceOnboarding('battle', 'battle-setup-reserves', 'battle-setup-deploy')
    if (at === 7) advanceOnboarding('battle', 'battle-setup-deploy', 'battle-setup-first')
    if (at === 8) advanceOnboarding('battle', 'battle-setup-first', 'battle-setup-begin')
  }, [at])
  const logStep = (step: number) => (step === 0 ? 0 : step + 1)
  const nameDisposition = useDispositionNames()
  const { data: deployments } = useQuery(deploymentsQuery())
  const deployment = deploymentFor(view.deploymentId, deployments)
  const attacker = table.find((side) => side.armies.some((army) => army.playerId === view.attackerId))
  const defender = attacker ? table.find((side) => side.index !== attacker.index) : undefined
  // The roll-off is recorded a section before the battle begins, and read back in the
  // one after it, so it is folded from the log rather than held on the device that saw it.
  const firstSide = table.find((side) => side.armies.some((army) => army.playerId === view.firstPlayerId))
  /** The mission card a matchup panel has been asked to read out, if any. */
  const [reading, setReading] = useState<MissionDetails | null>(null)
  // Another seat can move the table off this section while the card is open, which
  // unmounts the dialog without closing it — and it would spring back open on return.
  useEffect(() => setReading(null), [at])
  const attached = view.players.filter((player) => player.roster).length
  const ready = attached === view.players.length
  const format = rosterBattleFormat(view)
  const youHaveAnArmy = Boolean(yours?.armies.find((army) => army.isViewer)?.roster)
  // A practice opponent brings nothing on its own, so its list is one of the ones
  // this table still owes before setup can move on.
  const owed = table.flatMap((side) => side.armies).filter((army) => (army.isViewer || army.automated) && !army.roster)

  /**
   * What still has to be true before a section can be left behind.
   *
   * Asked of any section rather than only the one being read, because it is also
   * what says whether a section further along can be jumped to: everything before
   * it has to have been settled, and nothing else does.
   */
  const blockedAt = (step: number) => {
    // Said at every section rather than only the first, because each of them draws
    // your army: without one they were blank screens under a cheerful heading.
    if (step === 0 && owed.length) return `Choose an army for ${owed.map((army) => army.playerName).join(' and ')} to continue.`
    if (view.settings.limit === null)
      return !ready
        ? 'Wait for every player to choose an army.'
        : view.settings.sizeFromRosters
          ? format.problem === 'manual'
            ? 'Choose a battle size for text-only armies.'
            : format.problem === 'unsupported'
              ? 'These roster formats do not make a supported battle size. Choose another format; allies split the points evenly.'
              : 'Choose matching roster formats for each side. Allies split the points evenly.'
          : 'Choose a battle size to continue.'
    if (step >= 1 && !youHaveAnArmy) return 'Choose your army to continue.'
    const undecided = table.filter((side) => side.dispositionChoices.length > 1 && !side.disposition)
    if (step === 1 && undecided.length) return 'Choose the Force Disposition each allied side plays to continue.'
    if (step === 2 && !view.deploymentId)
      return isKotcLimit(view.settings.limit) ? 'Setting up the Colosseum battlefield.' : 'Choose a battlefield layout to continue.'
    if (step === 3 && !view.attackerId) return 'Roll off and record the defender to continue.'
    const missingCards = table.filter((side) => !missionCardsReady(side))
    if (step >= 4 && missingCards.length) return 'Wait for every side’s mission cards before continuing.'
    return null
  }
  const blocked = blockedAt(at)
  /**
   * A section is open once everything before it is settled — and wherever the table
   * has already reached, so a step it is standing on is never one it cannot press.
   */
  const reachable = (step: number) => step <= at || [...Array(step).keys()].every((before) => blockedAt(before) === null)

  const steps: RailStep[] = [
    {
      name: 'Setup',
      detail: `${view.settings.limit === null ? 'Choose armies' : `${view.settings.limit} points`} · ${attached}/${view.players.length} armies`,
      complete: view.settings.limit !== null && ready,
      reachable: true,
    },
    // Derived rather than chosen: both dispositions being in is what settles it.
    { name: 'Mission', detail: mission?.name ?? 'Choose the armies first', complete: Boolean(mission), reachable: reachable(1) },
    {
      name: 'Battlefield',
      detail: deployment?.name ?? (view.deploymentId ? 'Layout chosen' : 'Choose a layout'),
      complete: Boolean(view.deploymentId),
      reachable: reachable(2),
    },
    {
      name: 'Defender',
      detail: view.attackerId ? 'Defender chosen' : 'Roll off for it',
      complete: Boolean(view.attackerId),
      reachable: reachable(3),
    },
    // The cards settle themselves once an army is attached, so having them is what says this section is done.
    {
      name: 'Secondaries',
      detail: yours?.secondaryMode === 'fixed' ? `${yours.secondaries.length} of ${FIXED_SECONDARIES} fixed` : 'Drawn as the battle runs',
      complete: Boolean(yours?.stratagems.length),
      reachable: reachable(4),
    },
    {
      name: 'Reserves',
      detail: youHaveAnArmy ? 'Where units start' : 'Choose an army first',
      complete: ready,
      reachable: reachable(5),
    },
    // Where the models actually stand is the table's, so nothing here is completed.
    {
      name: 'Deploy',
      detail: defender ? 'Alternate from the defender' : 'Choose the defender first',
      complete: false,
      reachable: reachable(6),
    },
    { name: 'First turn', detail: firstSide ? sideName(firstSide) : 'Record the roll-off', complete: false, reachable: reachable(7) },
    {
      name: 'Pre-battle rules',
      detail: ready && view.deploymentId ? 'Ready to begin' : 'Setup incomplete',
      complete: false,
      reachable: reachable(8),
    },
  ]

  // A twist belongs to the pack that prints it, so changing the pack drops it above.
  const chosenPack = references?.packs.find((pack) => pack.id === view.settings.missionPackId)
  const twists = chosenPack?.twists ?? []
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
      clockLimitMinutes: null,
      ...settings,
    })

  return (
    <main className={`flex w-full flex-col ${at < steps.length - 1 ? 'pb-20' : ''}`}>
      {/*
       * Where the table is, banded across the top and pinned there the way the tracker
       * pins its scoreboard — the same offset under the same header, so setup and the
       * battle it becomes read as one screen changing rather than two pages.
       *
       * Edge to edge and flush: the sections divide the whole width between them, so
       * holding them to the measure of the column below left a wide screen with more
       * gutter than rail.
       */}
      <div className="sticky top-12 z-20 border-b border-edge bg-void/95 backdrop-blur">
        <StepRail steps={steps} at={at} onGo={(step) => send({ kind: 'set-setup-step', step: logStep(step) })} />
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <TableStrip sides={table} />

        {/*
         * One line under the title carries either what the step is for or what it is
         * still waiting on — the same slot either way, so nothing below it moves when
         * a step starts asking for something.
         */}
        <header className="space-y-1 text-center">
          <h1 className="text-lg text-balance sm:text-xl">
            {at === 2 && isKotcLimit(view.settings.limit) ? 'The Colosseum battlefield' : HEADLINES[at]}
          </h1>
          <p className={`text-sm ${blocked ? 'text-discarded' : 'text-dim'}`}>
            {blocked ??
              (at === 2 && isKotcLimit(view.settings.limit) ? 'The terrain and objectives always go in the same places.' : BLURBS[at])}
          </p>
        </header>

        <section aria-label={steps[at]?.name} className="min-w-0 space-y-4">
          {at === 0 ? (
            <>
              <ArmiesStep view={view} sides={table} send={send} attachSavedRoster={attachSavedRoster} pending={pending} problem={problem} />
              <SetupPanel className="grid gap-4 sm:grid-cols-2">
                <div data-onboarding="battle-setup-size">
                  {view.leagueToken || (view.settings.sizeFromRosters && format.problem !== 'manual') ? (
                    <>
                      <p className="eyebrow">Battle size</p>
                      <p className="mt-1 flex min-h-11 items-center rounded-lg border border-input bg-input/30 px-3 py-2 text-sm font-bold uppercase">
                        {view.settings.limit === null
                          ? 'Determined by your rosters'
                          : `${GAME_SIZES.find((size) => size.limit === view.settings.limit)?.name ?? 'Battle'} · ${view.settings.limit} points`}
                      </p>
                    </>
                  ) : (
                    <>
                      <Label htmlFor="battle-size" className="eyebrow">
                        Battle size
                      </Label>
                      <SearchableSelect
                        id="battle-size"
                        ariaLabel="Battle size"
                        groups={SIZE_OPTIONS}
                        value={view.settings.limit === null ? '' : String(view.settings.limit)}
                        onValueChange={(value) => configure({ limit: Number(value) })}
                        placeholder="Choose a battle size"
                        searchPlaceholder="Search sizes…"
                        className="mt-1 h-11"
                      />
                    </>
                  )}
                </div>
                {references?.packs.length ? (
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
            </>
          ) : null}

          {/*
           * The mission and the twist are one thing to settle: what this battle is
           * being played to. A primary comes from the disposition facing it rather
           * than from a pick, so the panel reads the matchup out and then asks the
           * one question about it there is. Where it is fought is the next section.
           */}
          {at === 1 && youHaveAnArmy ? (
            <>
              <SideDispositionChoice sides={table} nameDisposition={nameDisposition} send={send} />
              <SetupPanel className="space-y-3">
                <p className="eyebrow">Primary missions</p>
                <div data-onboarding="battle-setup-mission" className="grid gap-2 sm:grid-cols-2">
                  {table.map((side) => {
                    const card = side.mission ? primaryCardFor(side.mission.id) : undefined
                    const body = (
                      <>
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <SidePlayers side={side} linked={!card} />
                          {/* The card the side plays, which is the side's rather than any one list's. */}
                          <DispositionChip disposition={nameDisposition(side.disposition)} />
                        </span>
                        <span className={`mt-1 block ${side.mission ? CARD_NAME : 'text-sm font-bold text-faint uppercase'}`}>
                          {side.mission?.name ?? 'No mission for this matchup'}
                        </span>
                      </>
                    )
                    const shell = `block w-full rounded-sm border border-edge border-t-2 bg-sunken p-2.5 text-left ${tint(side.index).edge}`
                    // The whole card opens the card. A mission is read far more often
                    // than it is glanced at, and the name alone was a small target for
                    // something the table reaches for every round.
                    return card && side.mission ? (
                      <button
                        key={side.index}
                        type="button"
                        aria-label={`Read ${side.mission.name}`}
                        className={`${shell} transition-colors hover:border-edge-strong hover:bg-raised`}
                        onClick={() => setReading({ name: side.mission!.name, card, type: 'Primary mission' })}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={side.index} className={shell}>
                        {body}
                      </div>
                    )
                  })}
                </div>
                {reading ? <MissionDetailsDialog details={reading} onOpenChange={(open) => !open && setReading(null)} /> : null}
              </SetupPanel>
              <TwistChoice twists={twists} chosenId={view.settings.twistId} onChoose={(twistId) => configure({ twistId })} />
            </>
          ) : null}

          {at === 2 && youHaveAnArmy ? (
            <SetupPanel>
              <Battlefield
                view={view}
                send={send}
                pending={pending}
                allowedIds={mission?.deploymentIds}
                matchup={matchupName(table, nameDisposition)}
              />
            </SetupPanel>
          ) : null}

          {at === 3 ? <DefenderStep sides={table} attackerId={view.attackerId} send={send} /> : null}

          {at === 4 && youHaveAnArmy ? <SecondariesStep view={view} sides={table} send={send} pending={pending} /> : null}

          {at === 5 && youHaveAnArmy ? <ReservesStep view={view} sides={table} send={send} problem={problem} /> : null}

          {at === 6 && youHaveAnArmy ? <DeployStep sides={table} defender={defender} /> : null}

          {at === 7 && view.deploymentId ? <FirstTurnStep sides={table} first={firstSide?.index ?? null} send={send} /> : null}

          {at === 8 && view.deploymentId ? (
            <PreBattleRulesStep sides={table} first={firstSide} ready={ready} pending={pending} send={send} />
          ) : null}

          {problem && at !== 5 ? <p className="text-sm text-destructive">{problem}</p> : null}
        </section>
      </div>

      {/* The pointerless strip keeps Next reachable without covering the final setup control. */}
      {at < steps.length - 1 ? (
        <div data-setup-next className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end px-4 py-4">
          <Button
            className="pointer-events-auto h-11 gap-1.5 px-5 text-base shadow-lg"
            disabled={blocked !== null}
            onClick={() => send({ kind: 'set-setup-step', step: logStep(at + 1) })}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </main>
  )
}

const HEADLINES = [
  'Choose your armies',
  'Read the mission',
  'Choose the battlefield',
  'Choose the defender',
  'Choose how your secondaries are drawn',
  'Set your reserves',
  'Deploy the armies',
  'Choose who takes the first turn',
  'Resolve pre-battle rules',
]

const BLURBS = [
  'The battle format follows your saved rosters. Each side brings the same points allowance; allies split it evenly.',
  'Each side finds its opponent’s disposition on its own Force Disposition card, and plays the primary listed there. A twist is optional and bends one rule for the whole battle.',
  'One shared choice sets the deployment zones and the terrain for both sides.',
  'Roll off. The winner decides who attacks and who defends — the defender deploys first, the attacker deploys second.',
  'Tactical cards are dealt as the battle runs. Fixed cards are chosen now and played all game.',
  'Every unit starts on the battlefield unless you say otherwise. Hold one back to arrive from reserves or deep strike instead.',
  'Put the models on the table. Nothing is recorded here — this is what each side needs straight before it starts.',
  'After both armies deploy, record the roll-off here.',
  'Anything a unit does before the first turn happens now. Starting the battle opens the first command phase immediately.',
]
