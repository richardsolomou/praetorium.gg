import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { posthog } from 'posthog-js'
import { ArrowLeftRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { advanceOnboarding, ONBOARDING_FOCUS_EVENT } from '../onboarding/onboarding'
import { CombatantCard } from './CombatantCard'
import { CombatMatchup } from './CombatMatchup'
import { CombatBuffControls } from './CombatBuffControls'
import { SimulationMode } from './CombatControls'
import { RosterCombatComparison } from './RosterCombatComparison'
import { type Combatant, type CombatRoster, useCombatant } from './useCombatant'
import { attachedUnit } from '../../../core/attach'
import { decodeSimulatorState, encodeSimulatorState, type MatchupSettings, type SimulatorState } from '../../../contracts/simulatorState'
import { combatUnitsQuery } from '../../queries'
import { exampleMatchup, useMatchupHistory } from './matchupHistory'
import { RecentMatchups } from './RecentMatchups'
import type { RecentMatchup } from '../../../core/recentMatchups'

/** The standalone page keeps its matchup in the URL, so a link reopens the same calculation. */
export function CombatSimulator({
  shared,
  onShare,
  reference,
}: {
  shared?: string
  onShare: (shared: string | undefined) => void
  /** The reference page that opened the simulator, if one did. */
  reference?: 'datasheet'
}) {
  const [comparingRosters, setComparingRosters] = useState(false)
  const [session, setSession] = useState(() => ({ key: 0, shared }))
  const units = useQuery(combatUnitsQuery())
  const history = useMatchupHistory()
  const example = units.data ? exampleMatchup(units.data) : null
  const restore = (value: string) => {
    const initial = decodeSimulatorState(value)
    if (!initial) return
    setSession((current) => ({ key: current.key + 1, shared: value }))
    setComparingRosters(false)
    onShare(value)
  }
  const share = useCallback(
    (state: SimulatorState) => {
      const encoded = state.sides.some(Boolean) ? encodeSimulatorState(state) : undefined
      setSession((current) => (current.shared === encoded ? current : { ...current, shared: encoded }))
      if (encoded !== shared) onShare(encoded)
    },
    [shared, onShare],
  )
  return (
    <main className="w-full bg-sunken">
      <PageHeader
        eyebrow={null}
        title="Combat simulator"
        description="Compare shooting and melee between units or whole rosters. Try an editable Intercessors vs Necron Warriors example, or choose your own matchup."
        actions={
          <div className="space-y-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={!example}
              onClick={() => {
                if (!example) return
                posthog.capture('combat_simulator_example_started')
                restore(encodeSimulatorState(example))
              }}
            >
              Try an example
            </Button>
            {!units.isPending && !example ? <p className="text-sm text-dim">Example unavailable. Choose your own units below.</p> : null}
          </div>
        }
      />
      <PageContent>
        <SimulationMode
          rosters={comparingRosters}
          onChange={setComparingRosters}
          units={
            <div className="space-y-6">
              <CombatSimulatorMatchup
                key={session.key}
                initial={decodeSimulatorState(session.shared)}
                onChange={share}
                onRemember={history.remember}
                reference={reference}
              />
              <RecentMatchups surface="simulator" onOpen={restore} />
            </div>
          }
          comparison={
            <div className="border border-edge bg-panel">
              <RosterCombatComparison />
            </div>
          }
        />
      </PageContent>
    </main>
  )
}

/** The selected unit and everything attached to it, so a recent matchup names its leaders too. */
function joinedUnitName(combatant: Combatant) {
  const { pickIndex, picks, price } = combatant
  return [pickIndex, ...attachedUnit(picks.positioned, pickIndex)]
    .flatMap((index) => price.data?.units[index]?.name ?? [])
    .join(' + ')
    .slice(0, 200)
}

export function CombatSimulatorMatchup({
  source = 'standalone',
  roster,
  opponentRoster,
  firstArmyControl,
  secondArmyControl,
  inDialog = false,
  initial,
  onChange,
  onRemember,
  reference,
}: {
  source?: 'standalone' | 'roster' | 'battle'
  roster?: CombatRoster
  opponentRoster?: CombatRoster
  firstArmyControl?: ReactNode
  secondArmyControl?: ReactNode
  inDialog?: boolean
  initial?: SimulatorState | null
  onChange?: (state: SimulatorState) => void
  /** Keeps a completed pairing in the player's recent matchups; only the standalone simulator supplies it. */
  onRemember?: (entry: RecentMatchup) => void
  reference?: 'datasheet'
}) {
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    posthog.capture('combat_simulator_opened', { source, ...(reference ? { reference } : {}) })
  }, [source, reference])
  const initialFirst = initial?.sides[0]
  const initialSecond = initial?.sides[1]
  const first = useCombatant(
    roster,
    initialFirst && {
      ...initialFirst,
      preferences: initialFirst.preferences ?? (!initial?.swapped ? initial?.matchup?.preferences : undefined),
    },
  )
  const second = useCombatant(
    opponentRoster,
    initialSecond && {
      ...initialSecond,
      preferences: initialSecond.preferences ?? (initial?.swapped ? initial?.matchup?.preferences : undefined),
    },
  )
  const [reversed, setReversed] = useState(initial?.swapped ?? false)
  const [attacker, defender] = reversed ? [second, first] : [first, second]
  const checkpoints = useRef(new Set<string>())
  const failed = attacker.price.isError || attacker.sheets.isError || defender.price.isError || defender.sheets.isError
  useEffect(() => {
    const steps = [
      ...(attacker.pick ? ['attacker_selected'] : []),
      ...(defender.pick ? ['defender_selected'] : []),
      ...(attacker.ready && defender.ready && !failed ? ['ready'] : []),
      ...(failed ? ['load_failed'] : []),
    ]
    for (const step of steps) {
      if (checkpoints.current.has(step)) continue
      checkpoints.current.add(step)
      posthog.capture('combat_simulator_setup_progressed', { source, step })
    }
  }, [source, attacker.pick, defender.pick, attacker.ready, defender.ready, failed])
  const matchupKey = `${reversed}:${attacker.identity}:${defender.identity}`
  const activeMatchup = useRef(matchupKey)
  useLayoutEffect(() => {
    activeMatchup.current = matchupKey
  }, [matchupKey])
  const [displayKey, setDisplayKey] = useState(matchupKey)
  if (attacker.ready && defender.ready && displayKey !== matchupKey) setDisplayKey(matchupKey)
  const [settings, setSettings] = useState(() => ({ key: matchupKey, value: initial?.matchup }))
  const reportSettings = useCallback(
    (value: MatchupSettings) => {
      if (displayKey !== matchupKey || activeMatchup.current !== matchupKey) return
      setSettings((current) =>
        current.key === matchupKey && JSON.stringify(current.value) === JSON.stringify(value) ? current : { key: matchupKey, value },
      )
    },
    [matchupKey, displayKey],
  )
  const matchup = {
    ...((settings.key === matchupKey ? settings.value : undefined) ?? {
      adjustments: {},
      excluded: { ranged: [], melee: [] },
      allocation: [],
    }),
    preferences: attacker.weaponPreferences,
  }
  const state = JSON.stringify({ v: 1, sides: [first.shared, second.shared], swapped: reversed, matchup })
  useEffect(() => {
    onChange?.(JSON.parse(state) as SimulatorState)
  }, [state, onChange])
  useEffect(() => {
    const advance = () => {
      if (attacker.snapshot) advanceOnboarding('simulator', 'simulator-attacker', 'simulator-defender')
      if (attacker.snapshot && defender.snapshot) advanceOnboarding('simulator', 'simulator-defender', 'simulator-results')
    }
    advance()
    window.addEventListener(ONBOARDING_FOCUS_EVENT, advance)
    return () => window.removeEventListener(ONBOARDING_FOCUS_EVENT, advance)
  }, [attacker.snapshot, defender.snapshot])
  return (
    <CombatMatchup
      entryPoint={source}
      key={displayKey}
      initialSettings={matchup}
      onSettingsChange={reportSettings}
      onCompleted={() => {
        if (!onRemember || !attacker.ready || !defender.ready || !attacker.unit || !defender.unit) return
        onRemember({
          shared: encodeSimulatorState(JSON.parse(state) as SimulatorState),
          attacker: joinedUnitName(attacker),
          defender: joinedUnitName(defender),
        })
      }}
      preferences={attacker.weaponPreferences}
      invalidatedPreferences={attacker.invalidatedPreferences}
      onPreferencesChange={attacker.setWeaponPreferences}
      attacker={attacker.snapshot}
      defender={defender.snapshot}
      pending={!attacker.ready || !defender.ready}
      failed={failed}
      inDialog={inDialog}
      loadoutSpace={attacker.loadoutSpace}
      attackerControl={
        <CombatantCard
          side="Attacker"
          combatant={attacker}
          armyControl={reversed ? secondArmyControl : firstArmyControl}
          headingAction={
            <Button
              variant="outline"
              size="icon-sm"
              className="bg-panel text-dim active:not-aria-[haspopup]:translate-y-0"
              data-onboarding="simulator-swap"
              aria-label="Swap attacker and defender"
              title="Swap attacker and defender"
              onClick={() => setReversed((current) => !current)}
              disabled={!attacker.snapshot || !defender.snapshot || !attacker.ready || !defender.ready || failed}
            >
              <ArrowLeftRight aria-hidden />
            </Button>
          }
        />
      }
      defenderControl={<CombatantCard side="Defender" combatant={defender} armyControl={reversed ? firstArmyControl : secondArmyControl} />}
      attackerBuffs={<CombatBuffControls side="Attacker" combatant={attacker} opponent={defender} />}
      defenderBuffs={<CombatBuffControls side="Defender" combatant={defender} opponent={attacker} />}
    />
  )
}
