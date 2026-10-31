import { useQuery } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Crosshair, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { combatUnitsQuery, factionIndexQuery } from '../../queries'
import { openSealedEventRoster, sharedRoster } from '../../functions'
import { rosterSourceKey } from '../../../contracts/simulatorState'
import { sealedCombatRoster } from './rosterCombat'
import { errorMessage } from '../../queryClient'
import { useStoredValue, writeStoredValue } from '../../storedValue'
import { useHydrated } from '../../useClientValue'
import { rosterTitle } from '../rosters/RosterSummary'
import { CombatSimulatorMatchup } from './CombatSimulator'
import { CombatDialog } from './RosterCombatDialog'
import type { CombatRoster } from './useCombatant'
import { ROSTER_COMBAT_TIMEOUT, runRosterCombat } from './runRosterCombat'
import { readRosterCombatSelection, writeRosterCombatSelection } from './rosterCombatCache'
import type { RosterCombatSummary, RosterCombatUnit } from './rosterCombat'
import { RosterCombatTable } from './RosterCombatTable'
import { BenchmarkTargets } from './BenchmarkTargets'
import { MatchupSidePicker, parseUnitChoice, SINGLE_UNIT, type UnitSources } from './MatchupSidePicker'
import { ControlTooltip } from '../../components/ControlTooltip'
import { benchmarkRosters, defaultBenchmarkTargets, parseBenchmarkTargets, type BenchmarkTarget } from './benchmarks'
import { Problem } from '../../components/Problem'
import { ProgressBar } from '../../components/ProgressBar'
import { friendSealedEventLabel, friendSealedEventSource, OwnerAvatars, type RosterOwner, useSimulatorRosters } from './rosterOwners'

export type RosterCombatSource = {
  id: string
  label: string
  catalogueId?: string
  /** Whose lists these are, shown by face in the pickers. */
  owners?: readonly RosterOwner[]
  /** The picker heading it is listed under, when it is not one of the player's own. */
  group?: string
  load: (signal: AbortSignal) => Promise<readonly CombatRoster[]>
}
const BENCHMARKS = 'benchmarks'
const NONE: readonly string[] = []
const single = (id: string) => id === BENCHMARKS || id === SINGLE_UNIT || parseUnitChoice(id) !== null
const unitOrEmpty = (ids: readonly string[]) => ids.length === 1 && (ids[0] === SINGLE_UNIT || parseUnitChoice(ids[0]!) !== null)

type Comparison = {
  attacker: readonly CombatRoster[]
  defender: readonly CombatRoster[]
  attackers: RosterCombatUnit[]
  defenders: RosterCombatUnit[]
  results: Record<string, RosterCombatSummary>
  completed: number
}

export function RosterCombatComparison({
  sources,
  currentRoster,
  initialAttacker = NONE,
  initialDefender = NONE,
  liveKey,
  sessionKey = 'simulator',
  eventPairing = false,
  units,
}: {
  sources?: RosterCombatSource[]
  currentRoster?: CombatRoster
  initialAttacker?: readonly string[]
  initialDefender?: readonly string[]
  liveKey?: string
  sessionKey?: string
  eventPairing?: boolean
  /** A unit-against-unit matchup, shown in place of the table while neither side holds more than one unit. */
  units?: {
    matchup: ReactNode
    active: boolean
    onActiveChange: (active: boolean) => void
    /**
     * Lets either side field one unit on its own, from any datasheet or roster; without it, "Single unit" switches both
     * sides to the unit matchup at once.
     */
    fielding?: UnitSources & {
      /** The unit each side fields in the unit matchup, or the empty single unit. */
      sides: readonly [string, string]
      /** Shows the unit matchup with these units. */
      field: (attacker: string, defender: string) => void
    }
  }
}) {
  const { me, saved, friendRosters, sealedEventRosters } = useSimulatorRosters(!sources)
  const activeRosters = saved.data?.filter((roster) => !roster.archived) ?? []
  const factions = useQuery(factionIndexQuery())
  const catalogue = useQuery({ ...combatUnitsQuery(), enabled: !sources })
  const storageKey = `praetorium.combat-benchmarks.v1:${me.data?.id ?? 'guest'}`
  const storedBenchmarks = useStoredValue(storageKey)
  const storedTargets = useMemo(() => parseBenchmarkTargets(storedBenchmarks), [storedBenchmarks])
  // Each account keeps its own targets, so they are read once the browser knows whose they are.
  const targetsLoaded = useHydrated() && !sources && !me.isPending
  const [storageProblem, setStorageProblem] = useState<string | null>(null)
  const defaults = defaultBenchmarkTargets(catalogue.data ?? [])
  const savedTargets = targetsLoaded ? storedTargets : null
  const targets = savedTargets ?? defaults.targets
  const options: RosterCombatSource[] = sources ?? [
    {
      id: BENCHMARKS,
      label: 'Benchmark targets',
      load: async () => {
        if (!catalogue.data) throw new Error('Benchmark unit data is still loading. Try again.')
        if (!savedTargets && defaults.missing.length)
          throw new Error(`Some default benchmarks are unavailable: ${defaults.missing.join(', ')}. Edit or reset the target set.`)
        return benchmarkRosters(targets, catalogue.data)
      },
    },
    ...(currentRoster
      ? [{ id: 'current', label: 'Current roster', catalogueId: currentRoster.catalogueId, load: async () => [currentRoster] }]
      : []),
    ...activeRosters.map((roster) => ({
      id: roster.id,
      catalogueId: roster.catalogueId,
      label: rosterTitle(
        roster,
        factions.data?.factions.find((faction) => faction.id === roster.catalogueId),
      ),
      load: async (signal: AbortSignal) => {
        const data = await sharedRoster({ data: { id: roster.id }, signal })
        if (!data) throw new Error('This roster is no longer available.')
        return [{ ...data, pickIndex: 0 }]
      },
    })),
    ...friendRosters.map(({ roster, owner }) => ({
      id: roster.id,
      catalogueId: roster.catalogueId,
      group: "Friends' rosters",
      owners: [owner],
      label: `${rosterTitle(
        roster,
        factions.data?.factions.find((faction) => faction.id === roster.catalogueId),
      )} · ${owner.name}`,
      load: async (signal: AbortSignal) => {
        const data = await sharedRoster({ data: { id: roster.id }, signal })
        if (!data) throw new Error('This roster is no longer available.')
        return [{ ...data, pickIndex: 0, owner }]
      },
    })),
    ...sealedEventRosters.map((entry) => {
      const { sealedEvent } = friendSealedEventSource(entry)
      const owner = { name: entry.ownerName, image: entry.ownerImage }
      return {
        id: rosterSourceKey({ sealedEvent }),
        catalogueId: entry.catalogueId,
        group: "Friends' sealed rosters",
        owners: [owner],
        label: friendSealedEventLabel(entry),
        load: async (signal: AbortSignal) => {
          const roster = sealedCombatRoster(
            await openSealedEventRoster({
              data: { token: sealedEvent.token, eventToken: sealedEvent.eventToken, userId: sealedEvent.userId },
              signal,
            }),
          )
          if (!roster) throw new Error('This revealed roster has no saved loadouts available to simulate.')
          return [{ ...roster, owner }]
        },
      }
    }),
  ]
  const selectionKey = `${storageKey}:${currentRoster ? 'draft' : sessionKey}`
  const initialSelection = () => {
    const stored = readRosterCombatSelection(selectionKey)
    return {
      attacker: stored?.attacker ?? (initialAttacker.length ? initialAttacker : currentRoster ? ['current'] : []),
      defender: stored?.defender ?? (initialDefender.length ? initialDefender : sources ? [] : [BENCHMARKS]),
    }
  }
  const [attackerIds, setAttackerIds] = useState(() => initialSelection().attacker)
  const [defenderIds, setDefenderIds] = useState(() => initialSelection().defender)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [running, setRunning] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [pair, setPair] = useState<{ row: number; column: number } | null>(null)
  const active = useRef<AbortController | null>(null)
  const clearComparison = (runningNext: boolean) => {
    setRunning(runningNext)
    setComparison(null)
    setProblem(null)
    setPair(null)
  }
  /** Abandons the run in flight and the comparison it was building. */
  const stop = () => {
    active.current?.abort()
    active.current = null
    clearComparison(false)
  }
  const account = useRef(storageKey)
  const switchAccount = useEffectEvent(() => {
    stop()
    const initial = initialSelection()
    setAttackerIds(initial.attacker)
    setDefenderIds(initial.defender)
  })
  useEffect(() => {
    if (account.current === storageKey) return
    account.current = storageKey
    switchAccount()
  }, [storageKey])
  useEffect(
    () => () => {
      active.current?.abort()
      active.current = null
    },
    [],
  )
  const select = (attacker: readonly string[], defender: readonly string[]) => {
    stop()
    setAttackerIds(attacker)
    setDefenderIds(defender)
    writeRosterCombatSelection(selectionKey, attacker, defender)
  }
  const shown = (side: 0 | 1): readonly string[] =>
    units?.active ? [units.fielding?.sides[side] ?? SINGLE_UNIT] : side ? defenderIds : attackerIds
  const add = (side: 'attacker' | 'defender', id: string) => {
    stop()
    if (id === SINGLE_UNIT && !units?.fielding) {
      units?.onActiveChange(true)
      return
    }
    const current = shown(side === 'attacker' ? 0 : 1)
    const next = single(id) ? [id] : [...current.filter((candidate) => !single(candidate)), id]
    let attacker = side === 'attacker' ? next : shown(0)
    let defender = side === 'defender' ? next : shown(1)
    if (units?.fielding && unitOrEmpty(attacker) && unitOrEmpty(defender)) {
      units.fielding.field(attacker[0]!, defender[0]!)
      return
    }
    if (units?.active) {
      units.onActiveChange(false)
      // A side left as the single unit keeps the rosters it last held; on the standalone page, where that is an empty
      // card, the attacker waits for a choice and benchmarks defend.
      if (attacker[0] === SINGLE_UNIT) attacker = units.fielding ? [] : attackerIds
      if (defender[0] === SINGLE_UNIT) defender = units.fielding ? [BENCHMARKS] : defenderIds
    }
    select(attacker, defender)
  }
  const remove = (side: 'attacker' | 'defender', id: string) =>
    select(
      side === 'attacker' ? attackerIds.filter((candidate) => candidate !== id) : attackerIds,
      side === 'defender' ? defenderIds.filter((candidate) => candidate !== id) : defenderIds,
    )
  const editTargets = (next: BenchmarkTarget[] | null) => {
    setStorageProblem(
      writeStoredValue(storageKey, next && JSON.stringify(next))
        ? null
        : 'Benchmark changes could not be saved. They will only last for this session.',
    )
  }
  const execute = async () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const timer = setTimeout(
      () =>
        controller.abort(new Error('The comparison reached its five-minute limit. Completed pairings are retained; run again to retry.')),
      ROSTER_COMBAT_TIMEOUT,
    )
    try {
      const loadUnit = async (id: string): Promise<CombatRoster[]> => {
        const unit = parseUnitChoice(id)!
        if (unit.kind === 'datasheet') {
          if (!catalogue.data) throw new Error('Unit data is still loading. Try again.')
          return benchmarkRosters([{ key: id, catalogueId: unit.catalogueId, entryId: unit.entryId, name: unit.name }], catalogue.data)
        }
        const roster = await units?.fielding?.loadRoster(unit.key)
        if (!roster) throw new Error('This roster is no longer available.')
        return [{ ...roster, pickIndex: unit.pickIndex, only: true }]
      }
      const load = async (ids: readonly string[]) => {
        if (!ids.length) throw new Error('Choose an attacking roster and a defending roster.')
        const rosters = structuredClone(
          (
            await Promise.all(
              ids.map((id) => (parseUnitChoice(id) ? loadUnit(id) : options.find((source) => source.id === id)!.load(controller.signal))),
            )
          ).flat(),
        )
        controller.signal.throwIfAborted()
        return rosters
      }
      const attacker = await load(attackerIds)
      const defender = await load(defenderIds)
      await runRosterCombat({
        attacker,
        defender,
        signal: controller.signal,
        onPrepared: (attackers, defenders) => {
          setComparison({ attacker, defender, attackers, defenders, results: {}, completed: 0 })
        },
        onResult: (row, column, result) =>
          setComparison(
            (current) =>
              current && { ...current, results: { ...current.results, [`${row}:${column}`]: result }, completed: current.completed + 1 },
          ),
      })
    } catch (error) {
      if (active.current === controller) setProblem(errorMessage(error))
    } finally {
      clearTimeout(timer)
      if (active.current === controller) {
        active.current = null
        setRunning(false)
      }
    }
  }
  const run = () => {
    clearComparison(true)
    void execute()
  }
  const usingBenchmarks = attackerIds.includes(BENCHMARKS) || defenderIds.includes(BENCHMARKS)
  // Benchmark targets and a lone datasheet are both built from the unit index.
  const usingCatalogue = usingBenchmarks || [...attackerIds, ...defenderIds].some((id) => parseUnitChoice(id)?.kind === 'datasheet')
  const chosen = (ids: readonly string[]) =>
    ids.length > 0 && ids.every((id) => parseUnitChoice(id) || options.some((source) => source.id === id))
  const ready = chosen(attackerIds) && chosen(defenderIds)
  const waitingForAccount = !sources && me.isPending
  const benchmarkIndex = !sources && usingCatalogue ? catalogue.data : undefined
  const waitingForBenchmarks = usingBenchmarks && !targetsLoaded
  const savedVersions = sources
    ? undefined
    : JSON.stringify(
        saved.data
          ?.filter((source) => attackerIds.includes(source.id) || defenderIds.includes(source.id))
          .map((source) => [source.id, source.updatedAt]),
      )
  /*
   * A change to the matchup's inputs shows that matchup again: from the cache while browsing, or computed while a
   * battle's lists are live. The reset happens while rendering, as React describes for state that follows other
   * values, and the effect below only starts the work.
   */
  const restoreInputs = [
    liveKey,
    attackerIds.join(),
    defenderIds.join(),
    storageKey,
    waitingForAccount,
    benchmarkIndex,
    savedVersions,
    waitingForBenchmarks,
    usingBenchmarks && JSON.stringify(targets),
    currentRoster,
    units?.active,
  ]
  const [restoredFor, setRestoredFor] = useState<typeof restoreInputs | null>(null)
  const [restoration, setRestoration] = useState(0)
  if (!restoredFor || restoreInputs.some((value, index) => !Object.is(value, restoredFor[index]))) {
    setRestoredFor(restoreInputs)
    const restorable = !units?.active && !waitingForAccount && ready && !(usingCatalogue && !catalogue.data) && !waitingForBenchmarks
    // The last table stays until the new one is prepared, so editing targets or a live battle doesn't blank it.
    if (restorable) {
      setRunning(true)
      setProblem(null)
      setPair(null)
      setRestoration((count) => count + 1)
    }
  }
  const restore = useEffectEvent(() => void execute())
  useEffect(() => {
    if (restoration) restore()
  }, [restoration])
  const total = comparison ? comparison.attackers.length * comparison.defenders.length : 0
  const selected =
    pair && comparison
      ? {
          attacker: {
            ...comparison.attacker[comparison.attackers[pair.row]!.rosterIndex]!,
            pickIndex: comparison.attackers[pair.row]!.pickIndex,
          },
          defender: {
            ...comparison.defender[comparison.defenders[pair.column]!.rosterIndex]!,
            pickIndex: comparison.defenders[pair.column]!.pickIndex,
          },
        }
      : null
  const readError = !sources && (saved.error ?? me.error ?? (usingCatalogue ? catalogue.error : null))
  const icon = (source: RosterCombatSource) =>
    source.id === SINGLE_UNIT ? (
      <Swords className="size-4 text-info" aria-hidden />
    ) : source.id === BENCHMARKS ? (
      <Crosshair className="size-4 text-info" aria-hidden />
    ) : source.owners?.length ? (
      <OwnerAvatars owners={source.owners} />
    ) : undefined
  const choices: RosterCombatSource[] = [...(units ? [{ id: SINGLE_UNIT, label: 'Single unit', load: async () => [] }] : []), ...options]
  const pickerGroups = [
    { label: 'Units and targets', options: choices.filter((source) => single(source.id)) },
    ...[undefined, "Friends' rosters", "Friends' sealed rosters"].map((group) => ({
      label: group ?? (sources ? 'Revealed rosters' : 'Your rosters'),
      options: choices.filter((source) => !single(source.id) && source.group === group),
    })),
  ].map((group) => ({ ...group, options: group.options.map((source) => ({ ...source, icon: icon(source) })) }))
  const reversible = attackerIds.length > 0 && defenderIds.length > 0
  const sides = (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
      {(['attacker', 'defender'] as const).map((side, index) => (
        <fieldset
          key={side}
          aria-label={index ? 'Defending with' : 'Attacking with'}
          className={index ? 'col-start-3 row-start-1 min-w-0' : 'min-w-0'}
        >
          <p aria-hidden className="eyebrow mb-1">
            {index ? 'Defending with' : 'Attacking with'}
          </p>
          <MatchupSidePicker
            ariaLabel={index ? 'Defending with' : 'Attacking with'}
            groups={pickerGroups}
            value={shown(index ? 1 : 0)}
            single={single}
            unitId={SINGLE_UNIT}
            units={units?.fielding}
            onAdd={(id) => add(side, id)}
            onRemove={(id) => remove(side, id)}
            loading={!sources && Boolean(me.data) && saved.isPending}
          />
        </fieldset>
      ))}
      {units?.active ? null : (
        <ControlTooltip label={reversible ? 'Swap attacker and defender' : 'Choose both sides first'}>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Reverse direction"
            className="col-start-2 row-start-1 mt-5"
            disabled={!reversible}
            onClick={() => select(defenderIds, attackerIds)}
          >
            <ArrowLeftRight aria-hidden />
          </Button>
        </ControlTooltip>
      )}
    </div>
  )
  if (units?.active)
    return (
      <div className="space-y-4">
        <section aria-label="Matchup sides" className="border border-edge bg-panel p-3 sm:p-4">
          {sides}
        </section>
        {units.matchup}
      </div>
    )
  return (
    <section aria-label="Roster comparison" className={cn('min-w-0 space-y-3 p-3 sm:p-4', units && 'border border-edge bg-panel')}>
      <div className="border-b border-edge pb-3">{sides}</div>
      {storageProblem ? <Problem className="text-xs">{storageProblem}</Problem> : null}
      {!sources && !currentRoster && !me.isPending && !me.data ? (
        <p className="text-sm text-dim">Sign in and save both rosters to compare them here.</p>
      ) : null}
      {!sources && me.data && saved.isSuccess && !currentRoster && options.every((source) => source.id === BENCHMARKS) ? (
        <p className="text-sm text-dim">Save or import two rosters to start comparing targets.</p>
      ) : null}
      {readError ? (
        <Problem>
          {errorMessage(readError)}{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void (me.error ? me.refetch() : catalogue.error ? catalogue.refetch() : saved.refetch())}
          >
            Retry
          </Button>
        </Problem>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {!running && ready && (problem || (comparison && comparison.completed < total)) ? (
          <Button variant="outline" onClick={run}>
            Retry
          </Button>
        ) : null}
        {running ? (
          <Button variant="outline" onClick={() => active.current?.abort(new Error('Cancelled. Completed pairings are retained.'))}>
            Cancel
          </Button>
        ) : null}
        <output aria-live="polite" className="text-sm text-dim">
          {comparison
            ? `${comparison.completed} / ${total} matchups${running ? '…' : comparison.completed === total ? ' · Complete' : ' · Partial'}`
            : running
              ? 'Calculating…'
              : ''}
        </output>
      </div>
      {running ? <ProgressBar label="Matchups calculated" value={comparison?.completed} max={total} /> : null}
      {problem ? <Problem>{problem}</Problem> : null}
      <p className="text-xs text-dim">
        {liveKey === undefined ? 'Full health' : 'Live models and wounds'} · Default conditions
        <span className="hidden sm:inline">. Supported passive rules apply; cover, range bonuses and conditional buffs stay off.</span>
      </p>
      {!sources && usingBenchmarks ? (
        <BenchmarkTargets
          targets={targets}
          index={catalogue.data ?? []}
          disabled={!catalogue.data || !targetsLoaded}
          onChange={editTargets}
          onReset={() => editTargets(null)}
        />
      ) : null}
      {!comparison && !running && !ready ? (
        <p className="border border-dashed border-edge p-4 text-center text-sm text-dim">
          Choose rosters for both sides. Add more than one roster to a side to fight a doubles or 2v1 game together.
        </p>
      ) : null}
      {comparison ? (
        <RosterCombatTable
          attackers={comparison.attackers}
          defenders={comparison.defenders}
          results={comparison.results}
          benchmarkTargets={defenderIds.includes(BENCHMARKS)}
          eventPairing={eventPairing}
          onSelect={(row, column) => setPair({ row, column })}
        />
      ) : null}
      {selected ? (
        <CombatDialog onClose={() => setPair(null)} battle={liveKey !== undefined}>
          <CombatSimulatorMatchup
            source={liveKey === undefined ? 'roster' : 'battle'}
            roster={selected.attacker}
            opponentRoster={selected.defender}
            inDialog
          />
        </CombatDialog>
      ) : null}
    </section>
  )
}
