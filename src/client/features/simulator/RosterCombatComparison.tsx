import { useQuery } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { RosterPicker } from './RosterPicker'
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
  initialAttacker = '',
  initialDefender = '',
  liveKey,
  sessionKey = 'simulator',
  eventPairing = false,
}: {
  sources?: RosterCombatSource[]
  currentRoster?: CombatRoster
  initialAttacker?: string
  initialDefender?: string
  liveKey?: string
  sessionKey?: string
  eventPairing?: boolean
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
      id: 'benchmarks',
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
      attacker: stored?.attacker ?? (initialAttacker || (currentRoster ? 'current' : '')),
      defender: stored?.defender ?? (initialDefender || (sources ? '' : 'benchmarks')),
    }
  }
  const [attackerId, setAttackerId] = useState(() => initialSelection().attacker)
  const [defenderId, setDefenderId] = useState(() => initialSelection().defender)
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
    setAttackerId(initial.attacker)
    setDefenderId(initial.defender)
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
  const change = (side: 'attacker' | 'defender', id: string) => {
    stop()
    if (side === 'attacker') setAttackerId(id)
    else setDefenderId(id)
    writeRosterCombatSelection(selectionKey, side === 'attacker' ? id : attackerId, side === 'defender' ? id : defenderId)
  }
  const editTargets = (next: BenchmarkTarget[] | null) => {
    stop()
    setStorageProblem(
      writeStoredValue(storageKey, next && JSON.stringify(next))
        ? null
        : 'Benchmark changes could not be saved. They will only last for this session.',
    )
  }
  const execute = async (cachedOnly: boolean) => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const timer = setTimeout(
      () =>
        controller.abort(new Error('The comparison reached its five-minute limit. Completed pairings are retained; run again to retry.')),
      ROSTER_COMBAT_TIMEOUT,
    )
    try {
      const attackSource = options.find((source) => source.id === attackerId)
      const defenceSource = options.find((source) => source.id === defenderId)
      if (!attackSource || !defenceSource) throw new Error('Choose an attacking roster and a defending roster.')
      const attacker = structuredClone(await attackSource.load(controller.signal))
      controller.signal.throwIfAborted()
      const defender = structuredClone(await defenceSource.load(controller.signal))
      controller.signal.throwIfAborted()
      await runRosterCombat({
        attacker,
        defender,
        signal: controller.signal,
        cachedOnly,
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
    void execute(false)
  }
  const usingBenchmarks = attackerId === 'benchmarks' || defenderId === 'benchmarks'
  const waitingForAccount = !sources && me.isPending
  const benchmarkIndex = !sources && usingBenchmarks ? catalogue.data : undefined
  const waitingForBenchmarks = usingBenchmarks && !targetsLoaded
  const savedVersions = sources
    ? undefined
    : JSON.stringify(
        saved.data?.filter((source) => source.id === attackerId || source.id === defenderId).map((source) => [source.id, source.updatedAt]),
      )
  /*
   * A change to the matchup's inputs shows that matchup again: from the cache while browsing, or computed while a
   * battle's lists are live. The reset happens while rendering, as React describes for state that follows other
   * values, and the effect below only starts the work.
   */
  const restoreInputs = [
    liveKey,
    attackerId,
    defenderId,
    storageKey,
    waitingForAccount,
    benchmarkIndex,
    savedVersions,
    waitingForBenchmarks,
    currentRoster,
  ]
  const [restoredFor, setRestoredFor] = useState<typeof restoreInputs | null>(null)
  const [restoration, setRestoration] = useState<{ cachedOnly: boolean } | null>(null)
  if (!restoredFor || restoreInputs.some((value, index) => !Object.is(value, restoredFor[index]))) {
    setRestoredFor(restoreInputs)
    const restorable =
      !(liveKey === undefined && running) &&
      !waitingForAccount &&
      Boolean(attackerId && defenderId) &&
      !(usingBenchmarks && (!catalogue.data || waitingForBenchmarks)) &&
      options.some((source) => source.id === attackerId) &&
      options.some((source) => source.id === defenderId)
    if (restorable) {
      clearComparison(liveKey !== undefined)
      setRestoration({ cachedOnly: liveKey === undefined })
    }
  }
  const restore = useEffectEvent((cachedOnly: boolean) => void execute(cachedOnly))
  useEffect(() => {
    if (restoration) restore(restoration.cachedOnly)
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
  const readError = !sources && (saved.error ?? me.error ?? (usingBenchmarks ? catalogue.error : null))
  return (
    <section aria-label="Roster comparison" className="min-w-0 space-y-3 p-3 sm:p-4">
      <div className="border-b border-edge pb-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3">
          {(['attacker', 'defender'] as const).map((side, index) => (
            <div key={side} className={index ? 'col-start-3 row-start-1 min-w-0' : 'min-w-0'}>
              <p className="eyebrow mb-1">{index ? 'Targets' : 'Attackers'}</p>
              <RosterPicker
                ariaLabel={index ? 'Defending roster' : 'Attacking roster'}
                groups={[undefined, "Friends' rosters", "Friends' sealed rosters"].map((group) => ({
                  label: group ?? (sources ? 'Revealed rosters' : 'Rosters and targets'),
                  options: options
                    .filter((source) => source.group === group)
                    .map((source) => ({
                      ...source,
                      icon:
                        source.id === 'benchmarks' ? (
                          <Crosshair className="size-4 text-info" aria-hidden />
                        ) : source.owners?.length ? (
                          <OwnerAvatars owners={source.owners} />
                        ) : undefined,
                    })),
                }))}
                value={index ? defenderId : attackerId}
                onValueChange={(id) => change(side, id)}
                disabled={running}
                loading={!sources && Boolean(me.data) && saved.isPending}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Reverse direction"
            className="col-start-2 row-start-1 mb-1"
            disabled={running || !attackerId || !defenderId}
            onClick={() => {
              stop()
              setAttackerId(defenderId)
              setDefenderId(attackerId)
              writeRosterCombatSelection(selectionKey, defenderId, attackerId)
            }}
          >
            <ArrowLeftRight aria-hidden />
          </Button>
        </div>
      </div>
      {storageProblem ? <Problem className="text-xs">{storageProblem}</Problem> : null}
      {!sources && !currentRoster && !me.isPending && !me.data ? (
        <p className="text-sm text-dim">Sign in and save both rosters to compare them here.</p>
      ) : null}
      {!sources && me.data && saved.isSuccess && !currentRoster && options.every((source) => source.id === 'benchmarks') ? (
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
        <Button disabled={running || !attackerId || !defenderId || (usingBenchmarks && (!catalogue.data || !targetsLoaded))} onClick={run}>
          {comparison ? 'Run again' : 'Run all matchups'}
        </Button>
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
          disabled={running || !catalogue.data || !targetsLoaded}
          onChange={editTargets}
          onReset={() => editTargets(null)}
        />
      ) : null}
      {!comparison && !running && attackerId && defenderId ? (
        <p className="border border-dashed border-edge p-4 text-center text-sm text-dim">
          Every attacking unit is matched against every target. Run all matchups to fill in the table.
        </p>
      ) : null}
      {comparison ? (
        <RosterCombatTable
          attackers={comparison.attackers}
          defenders={comparison.defenders}
          results={comparison.results}
          benchmarkTargets={defenderId === 'benchmarks'}
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
