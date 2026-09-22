import { useState } from 'react'
import { PageContent, PageHeader } from '../../components/Page'
import { CombatantCard } from './CombatantCard'
import { CombatMatchup } from './CombatMatchup'
import { useCombatant } from './useCombatant'

export function CombatSimulator() {
  const first = useCombatant()
  const second = useCombatant()
  const [reversed, setReversed] = useState(false)
  const [attacker, defender] = reversed ? [second, first] : [first, second]
  return (
    <main className="w-full bg-sunken">
      <PageHeader
        eyebrow="Mathhammer"
        title="Combat simulator"
        description="Compare shooting and melee between two units. Change a loadout and the odds update automatically."
      />
      <PageContent>
        <div className="mx-auto max-w-3xl">
          <CombatMatchup
            key={`${reversed}:${attacker.faction}:${attacker.picks.positioned[0]?.entryId}:${defender.faction}:${defender.picks.positioned[0]?.entryId}`}
            onSwap={() => setReversed((current) => !current)}
            attacker={attacker.snapshot}
            defender={defender.snapshot}
            pending={!attacker.ready || !defender.ready}
            failed={attacker.price.isError || attacker.sheets.isError || defender.price.isError || defender.sheets.isError}
            attackerControl={<CombatantCard side="Attacker" combatant={attacker} />}
            defenderControl={<CombatantCard side="Defender" combatant={defender} />}
          />
          <p className="mt-3 text-xs text-faint">Data provided by game-datacards, BSData, and the 40kdc community contributors.</p>
        </div>
      </PageContent>
    </main>
  )
}
