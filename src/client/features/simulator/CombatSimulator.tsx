import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { posthog } from 'posthog-js'
import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { CombatantCard } from './CombatantCard'
import { CombatMatchup } from './CombatMatchup'
import { CombatBuffControls } from './CombatBuffControls'
import { type CombatRoster, useCombatant } from './useCombatant'
import { decodeSimulatorState, encodeSimulatorState, type MatchupSettings, type SimulatorState } from './simulatorUrl'

/** The standalone page keeps its matchup in the URL, so a link reopens the same calculation. */
export function CombatSimulator({ shared, onShare }: { shared?: string; onShare: (shared: string | undefined) => void }) {
  const [initial] = useState(() => decodeSimulatorState(shared))
  const share = useCallback(
    (state: SimulatorState) => {
      const encoded = state.sides.some(Boolean) ? encodeSimulatorState(state) : undefined
      if (encoded !== shared) onShare(encoded)
    },
    [shared, onShare],
  )
  return (
    <main className="w-full bg-sunken">
      <PageHeader
        eyebrow="Mathhammer"
        title="Combat simulator"
        description="Compare shooting and melee between two units. Change a loadout and the odds update automatically."
      />
      <PageContent>
        <CombatSimulatorMatchup initial={initial} onChange={share} />
        <p className="mt-3 text-xs text-faint">Data provided by game-datacards and BSData.</p>
      </PageContent>
    </main>
  )
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
}: {
  source?: 'standalone' | 'roster' | 'battle'
  roster?: CombatRoster
  opponentRoster?: CombatRoster
  firstArmyControl?: ReactNode
  secondArmyControl?: ReactNode
  inDialog?: boolean
  initial?: SimulatorState | null
  onChange?: (state: SimulatorState) => void
}) {
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    posthog.capture('combat_simulator_opened', { source })
  }, [source])
  const first = useCombatant(roster, initial?.sides[0])
  const second = useCombatant(opponentRoster, initial?.sides[1])
  const [reversed, setReversed] = useState(initial?.swapped ?? false)
  const [attacker, defender] = reversed ? [second, first] : [first, second]
  const matchupKey = `${reversed}:${attacker.identity}:${defender.identity}`
  // Settings belong to one matchup: changing a unit remounts the matchup without them.
  const [settings, setSettings] = useState(() => ({ key: matchupKey, value: initial?.matchup }))
  const reportSettings = useCallback(
    (value: MatchupSettings) =>
      setSettings((current) =>
        current.key === matchupKey && JSON.stringify(current.value) === JSON.stringify(value) ? current : { key: matchupKey, value },
      ),
    [matchupKey],
  )
  const matchup = settings.key === matchupKey ? settings.value : undefined
  const state = JSON.stringify({ v: 1, sides: [first.shared, second.shared], swapped: reversed, ...(matchup ? { matchup } : {}) })
  useEffect(() => {
    onChange?.(JSON.parse(state) as SimulatorState)
  }, [state, onChange])
  const failed = attacker.price.isError || attacker.sheets.isError || defender.price.isError || defender.sheets.isError
  return (
    <CombatMatchup
      entryPoint={source}
      key={matchupKey}
      initialSettings={matchup}
      onSettingsChange={reportSettings}
      attacker={attacker.snapshot}
      defender={defender.snapshot}
      pending={!attacker.ready || !defender.ready}
      failed={failed}
      inDialog={inDialog}
      loadouts={attacker.loadouts}
      attackerControl={
        <CombatantCard
          side="Attacker"
          combatant={attacker}
          armyControl={reversed ? secondArmyControl : firstArmyControl}
          headingAction={
            <Button
              variant="ghost"
              size="sm"
              className="text-dim"
              aria-label="Swap attacker and defender"
              onClick={() => setReversed((current) => !current)}
              disabled={!attacker.snapshot || !defender.snapshot || !attacker.ready || !defender.ready || failed}
            >
              <ArrowLeftRight aria-hidden />
              Swap
            </Button>
          }
        />
      }
      defenderControl={<CombatantCard side="Defender" combatant={defender} armyControl={reversed ? firstArmyControl : secondArmyControl} />}
      buffs={
        <section aria-label="Buffs" className="mt-5 border-t border-edge pt-4">
          <div className="grid gap-4 @xl:grid-cols-2">
            <CombatBuffControls side="Attacker" combatant={attacker} opponent={defender} />
            <CombatBuffControls side="Defender" combatant={defender} opponent={attacker} />
          </div>
        </section>
      }
    />
  )
}
