import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { validCombatSurvivors } from '../../../core/combatSurvivors'
import type { CombatCarrier } from '../../../core/combatLoadout'
import { Stepper } from '../builder/LoadoutControls'

export function CombatSurvivorControls({
  original,
  models,
  selected,
  onSelect,
}: {
  original: readonly CombatCarrier[]
  models: number
  selected: readonly CombatCarrier[] | null
  onSelect: (carriers: CombatCarrier[]) => void
}) {
  const [draft, setDraft] = useState(() =>
    (selected?.length === original.length ? selected : original).map((carrier) => ({
      ...carrier,
      weapons: carrier.weapons.map((weapon) => ({ ...weapon })),
    })),
  )
  const count = draft.reduce((sum, carrier) => sum + carrier.models, 0)
  const resize = (index: number, remaining: number) =>
    setDraft((current) =>
      current.map((carrier, at) => {
        if (at !== index) return carrier
        const source = original[index]!
        return {
          ...carrier,
          models: remaining,
          weapons: carrier.weapons.map((weapon, weaponIndex) => {
            const equipped = source.weapons[weaponIndex]!
            const perModel = Math.ceil(equipped.count / source.models)
            const min = Math.max(0, equipped.count - (source.models - remaining) * perModel)
            return { ...weapon, count: Math.max(min, Math.min(weapon.count, equipped.count, remaining * perModel)) }
          }),
        }
      }),
    )
  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-dim">Select the {models} surviving models and the weapons they still carry.</p>
      {draft.map((carrier, index) => (
        <section
          // oxlint-disable-next-line react/no-array-index-key -- Model groups cannot reorder within this editor.
          key={index}
          className="space-y-3 border-b border-edge pb-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="rubric">{carrier.name}</h3>
            <Stepper
              label={`${carrier.name} survivors`}
              countLabel={`${carrier.name} surviving models`}
              count={carrier.models}
              onRemove={carrier.models > 0 ? () => resize(index, carrier.models - 1) : undefined}
              onAdd={carrier.models < original[index]!.models ? () => resize(index, carrier.models + 1) : undefined}
            />
          </div>
          {carrier.weapons.map((weapon, at) => {
            const source = original[index]!
            const equipped = source.weapons[at]!
            const perModel = Math.ceil(equipped.count / source.models)
            const min = Math.max(0, equipped.count - (source.models - carrier.models) * perModel)
            const max = Math.min(equipped.count, carrier.models * perModel)
            const change = (weaponCount: number) =>
              setDraft((current) =>
                current.map((entry, i) =>
                  i === index
                    ? { ...entry, weapons: entry.weapons.map((value, j) => (j === at ? { ...value, count: weaponCount } : value)) }
                    : entry,
                ),
              )
            return (
              <div key={weapon.name} className="flex items-center justify-between gap-3 text-sm text-dim">
                <span>{weapon.name}</span>
                <Stepper
                  label={`${carrier.name} surviving ${weapon.name}`}
                  countLabel={`${carrier.name} surviving ${weapon.name}`}
                  count={weapon.count}
                  onRemove={weapon.count > min ? () => change(weapon.count - 1) : undefined}
                  onAdd={weapon.count < max ? () => change(weapon.count + 1) : undefined}
                />
              </div>
            )
          })}
        </section>
      ))}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-dim">
          {count} / {models} models
        </span>
        <Button disabled={!validCombatSurvivors(original, draft, models)} onClick={() => onSelect(draft)}>
          Use survivors
        </Button>
      </div>
    </div>
  )
}
