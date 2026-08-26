import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Command } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { FIXED_SECONDARIES, GAME_SIZES, isKotcLimit } from '../../core/battle'
import { deploymentsQuery, gameReferencesQuery } from '../queries'
import { type Side, type SideMission, sideName, sides as foldSides } from '../sides'
import { SearchableSelect, type SearchableGroup } from './SearchableSelect'
import { Battlefield } from './Battlefield'
import { ArmiesStep } from './setup/ArmiesStep'
import { CHOOSABLE, CHOSEN, DispositionChip, SetupNote, SetupPanel, useDispositionNames } from './setup/chrome'
import { TwistChoice } from './setup/TwistChoice'
import { AttackerStep } from './setup/AttackerStep'
import { FirstTurnStep } from './setup/FirstTurnStep'
import { DeployStep } from './setup/DeployStep'
import { PreBattleRulesStep } from './setup/PreBattleRulesStep'
import { SideDispositionChoice } from './setup/SideDispositionChoice'
import { ReservesStep } from './setup/ReservesStep'
import { SecondariesStep } from './setup/SecondariesStep'
import { SidePlayers } from './PlayerName'
import { StepRail, type Step } from './setup/StepRail'
import { MissionDetailsDialog, type MissionDetails } from './battle/MissionCards'
import { CARD_NAME, tint } from './battle/tints'
import { TableStrip } from './setup/TableStrip'

type Props = {
  view: BattleView
  mission: { id: string; name: string; deploymentIds: string[] } | null
  /** Every side's matchup, so a side the table plays settles its cards from its own. */
  missions: { side: number; mission: SideMission | null }[]
  send: (command: Command) => void
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
  const at = view.setupStep
  const nameDisposition = useDispositionNames()
  const { data: deployments } = useQuery(deploymentsQuery())
  const deployment = deployments?.find((entry) => entry.id === view.deploymentId)
  // The attacker deploys second, so the other side is the one that starts.
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
    if (step >= 1 && !youHaveAnArmy) return 'Choose your army to continue.'
    if (step === 1 && owed.length) return `Choose an army for ${owed.map((army) => army.playerName).join(' and ')} to continue.`
    const undecided = table.filter((side) => side.dispositionChoices.length > 1 && !side.disposition)
    if (step === 2 && undecided.length) return 'Choose the Force Disposition each allied side plays to continue.'
    if (step === 3 && !view.deploymentId) return 'Choose a battlefield layout to continue.'
    if (step === 4 && !view.attackerId) return 'Roll off and record the attacker to continue.'
    // Fixed play is two cards, and a side of practice opponents is this table's to pick for.
    const short = table.filter((side) => side.played && side.secondaryMode === 'fixed' && side.secondaries.length < FIXED_SECONDARIES)
    if (step === 5 && short.length) return `Choose ${FIXED_SECONDARIES} fixed secondary missions to continue.`
    return null
  }
  const blocked = blockedAt(at)
  /**
   * A section is open once everything before it is settled — and wherever the table
   * has already reached, so a step it is standing on is never one it cannot press.
   */
  const reachable = (step: number) => step <= at || [...Array(step).keys()].every((before) => blockedAt(before) === null)

  const steps: Step[] = [
    {
      name: 'Format',
      detail: view.settings.limit ? `${view.settings.limit} points` : 'Choose a size',
      complete: view.settings.limit !== null,
      reachable: true,
    },
    { name: 'Armies', detail: `${attached}/${view.players.length} chosen`, complete: ready, reachable: reachable(1) },
    // Derived rather than chosen: both dispositions being in is what settles it.
    { name: 'Mission', detail: mission?.name ?? 'Choose the armies first', complete: Boolean(mission), reachable: reachable(2) },
    {
      name: 'Battlefield',
      // The layout's own name, not the slug it is stored under.
      detail: deployment?.name ?? (view.deploymentId ? view.deploymentId : 'Choose a layout'),
      complete: Boolean(view.deploymentId),
      reachable: reachable(3),
    },
    {
      name: 'Attacker',
      detail: view.attackerId ? 'Attacker chosen' : 'Roll off for it',
      complete: Boolean(view.attackerId),
      reachable: reachable(4),
    },
    // The cards settle themselves once an army is attached, so having them is what says this section is done.
    {
      name: 'Secondaries',
      detail: yours?.secondaryMode === 'fixed' ? `${yours.secondaries.length} of ${FIXED_SECONDARIES} fixed` : 'Drawn as the battle runs',
      complete: Boolean(yours?.stratagems.length),
      reachable: reachable(5),
    },
    {
      name: 'Reserves',
      detail: youHaveAnArmy ? 'Where units start' : 'Choose an army first',
      complete: ready,
      reachable: reachable(6),
    },
    // Where the models actually stand is the table's, so nothing here is completed.
    {
      name: 'Deploy',
      detail: attacker ? 'Alternate from the defender' : 'Choose the attacker first',
      complete: false,
      reachable: reachable(7),
    },
    { name: 'First turn', detail: firstSide ? sideName(firstSide) : 'Record the roll-off', complete: false, reachable: reachable(8) },
    {
      name: 'Pre-battle rules',
      detail: ready && view.deploymentId ? 'Ready to begin' : 'Setup incomplete',
      complete: false,
      reachable: reachable(9),
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
      limit: view.settings.limit ?? 2000,
      missionPackId: view.settings.missionPackId,
      terrainLayoutId: view.settings.terrainLayoutId,
      twistId: view.settings.twistId,
      teamBattle: view.settings.teamBattle,
      playerCount: view.settings.playerCount,
      clockLimitMinutes: null,
      ...settings,
    })

  return (
    <main className="flex w-full flex-col">
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
        <StepRail steps={steps} at={at} onGo={(step) => send({ kind: 'set-setup-step', step })} />
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <TableStrip sides={table} />

        {/*
         * One line under the title carries either what the step is for or what it is
         * still waiting on — the same slot either way, so nothing below it moves when
         * a step starts asking for something.
         */}
        <header className="space-y-1 text-center">
          <h1 className="text-lg text-balance sm:text-xl">{HEADLINES[at]}</h1>
          <p className={`text-sm ${blocked ? 'text-discarded' : 'text-dim'}`}>{blocked ?? BLURBS[at]}</p>
        </header>

        <section aria-label={steps[at]?.name} className="min-w-0 space-y-4">
          {at === 0 ? (
            <>
              <SetupPanel className="space-y-4">
                <div className="max-w-sm">
                  {view.leagueToken ? (
                    <>
                      <p className="eyebrow">Battle size</p>
                      <p className="mt-1 flex h-11 items-center border border-edge bg-sunken px-3 text-sm font-bold uppercase">
                        {GAME_SIZES.find((size) => size.limit === view.settings.limit)?.name ?? `${view.settings.limit} points`} ·{' '}
                        {view.settings.limit}
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
                        className="mt-1 h-11 rounded-none border-edge bg-sunken"
                      />
                    </>
                  )}
                </div>
                {references?.packs.length ? (
                  <fieldset>
                    <legend className="eyebrow">Mission pack</legend>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
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
              {isKotcLimit(view.settings.limit) ? (
                <SetupNote>
                  The synced rules source does not yet provide the KOTC 2.0 battlefield. Use the prototype pack for setup; Praetorium will
                  not substitute the older 9-inch deployment.
                </SetupNote>
              ) : null}
            </>
          ) : null}

          {at === 1 ? (
            <ArmiesStep view={view} sides={table} send={send} attachSavedRoster={attachSavedRoster} pending={pending} problem={problem} />
          ) : null}

          {/*
           * The mission and the twist are one thing to settle: what this battle is
           * being played to. A primary comes from the disposition facing it rather
           * than from a pick, so the panel reads the matchup out and then asks the
           * one question about it there is. Where it is fought is the next section.
           */}
          {at === 2 && youHaveAnArmy ? (
            <>
              <SideDispositionChoice sides={table} nameDisposition={nameDisposition} send={send} />
              <SetupPanel className="space-y-3">
                <p className="eyebrow">Primary missions</p>
                <div className="grid gap-2 sm:grid-cols-2">
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

          {at === 3 && youHaveAnArmy ? (
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

          {at === 4 ? <AttackerStep sides={table} attackerId={view.attackerId} token={view.token} send={send} /> : null}

          {at === 5 && youHaveAnArmy ? <SecondariesStep view={view} sides={table} send={send} pending={pending} /> : null}

          {at === 6 && youHaveAnArmy ? <ReservesStep sides={table} send={send} /> : null}

          {at === 7 && youHaveAnArmy ? <DeployStep sides={table} defender={defender} /> : null}

          {at === 8 && view.deploymentId ? (
            <FirstTurnStep sides={table} token={view.token} first={firstSide?.index ?? null} send={send} />
          ) : null}

          {at === 9 && view.deploymentId ? (
            <PreBattleRulesStep sides={table} first={firstSide} ready={ready} pending={pending} send={send} />
          ) : null}

          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
        </section>
      </div>

      {/*
       * The way on, in the corner of the page rather than on the rail: setup is a
       * column of questions of any length, and the one control that answers "and then?"
       * belongs within reach of a thumb wherever the section has been read to. Why it
       * will not move is already said under the heading, so the button only closes.
       *
       * Stuck to the bottom of setup rather than to the window, so scrolling to the end
       * sets it down above the site footer instead of over its links. The strip it rides
       * takes no clicks of its own, since it crosses the width of whatever is under it.
       */}
      {at < steps.length - 1 ? (
        <div className="pointer-events-none sticky bottom-0 z-30 mt-auto flex justify-end px-4 pt-4 pb-4">
          <Button
            className="pointer-events-auto h-11 gap-1.5 px-5 text-base shadow-lg"
            disabled={blocked !== null}
            onClick={() => send({ kind: 'set-setup-step', step: at + 1 })}
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
  'Choose how you are playing',
  'Choose the armies',
  'Read the mission',
  'Choose the battlefield',
  'Choose the attacker',
  'Choose how your secondaries are drawn',
  'Set your reserves',
  'Deploy the armies',
  'Choose who takes the first turn',
  'Resolve pre-battle rules',
]

const BLURBS = [
  'The points apply to each side. Every side with two armies splits them evenly.',
  'Everyone chooses their own army. Every attached army is visible here immediately.',
  'Each side finds its opponent’s disposition on its own Force Disposition card, and plays the primary listed there. A twist is optional and bends one rule for the whole battle.',
  'One shared choice sets the deployment zones and the terrain for both sides.',
  'Roll off. The winner decides who attacks and who defends — the defender deploys first, the attacker deploys second.',
  'Tactical cards are dealt as the battle runs. Fixed cards are chosen now and played all game.',
  'Every unit starts on the battlefield unless you say otherwise. Hold one back to arrive from reserves or deep strike instead.',
  'Put the models on the table. Nothing is recorded here — this is what each side needs straight before it starts.',
  'After both armies deploy, record the roll-off here.',
  'Anything a unit does before the first turn happens now. Starting the battle opens the first command phase immediately.',
]
