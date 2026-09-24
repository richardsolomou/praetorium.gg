import { useState, type ReactNode } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { CombatantCard } from './CombatantCard'
import { CombatMatchup } from './CombatMatchup'
import { CombatBuffControls } from './CombatBuffControls'
import { type CombatRoster, useCombatant } from './useCombatant'

export function CombatSimulator() {
  return (
    <main className="w-full bg-sunken">
      <PageHeader
        eyebrow="Mathhammer"
        title="Combat simulator"
        description="Compare shooting and melee between two units. Change a loadout and the odds update automatically."
      />
      <PageContent>
        <div className="mx-auto max-w-3xl">
          <CombatSimulatorMatchup />
          <p className="mt-3 text-xs text-faint">Data provided by game-datacards, BSData, and the 40kdc community contributors.</p>
        </div>
      </PageContent>
    </main>
  )
}

export function CombatSimulatorMatchup({
  roster,
  opponentRoster,
  firstArmyControl,
  secondArmyControl,
}: {
  roster?: CombatRoster
  opponentRoster?: CombatRoster
  firstArmyControl?: ReactNode
  secondArmyControl?: ReactNode
}) {
  const first = useCombatant(roster)
  const second = useCombatant(opponentRoster)
  const [reversed, setReversed] = useState(false)
  const [attacker, defender] = reversed ? [second, first] : [first, second]
  const failed = attacker.price.isError || attacker.sheets.isError || defender.price.isError || defender.sheets.isError
  return (
    <CombatMatchup
      key={`${reversed}:${attacker.identity}:${defender.identity}`}
      attacker={attacker.snapshot}
      defender={defender.snapshot}
      pending={!attacker.ready || !defender.ready}
      failed={failed}
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
