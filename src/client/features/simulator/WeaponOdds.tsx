import type { CombatResult } from '../../../core/combat'

const percent = (value: number) => `${(value * 100).toFixed(1)}%`

/** What each profile of one weapon does alone against the defender, with the profile in use marked. */
export function WeaponOdds({
  rows,
  muted,
}: {
  rows: readonly { name: string; result: CombatResult | undefined; inUse: boolean }[]
  muted: boolean
}) {
  const shown = rows.filter((row) => row.result)
  if (!shown.length) return null
  return (
    <div aria-label="Weapon odds" className="space-y-0.5 border-t border-edge px-2.5 py-1.5 text-2xs">
      {shown.map(({ name, result, inUse }) => (
        <p
          key={name}
          className={`readout flex flex-wrap justify-between gap-x-2 ${muted ? 'text-faint' : inUse ? 'text-bone' : 'text-dim'}`}
          aria-label={`${name} alone: ${percent(result!.wipe)} destroyed, ${result!.meanDamage.toFixed(2)} wounds lost on average`}
        >
          <span className="min-w-0">{shown.length > 1 ? name : 'Alone'}</span>
          <span>
            {percent(result!.wipe)} destroyed · {result!.meanDamage.toFixed(2)} wounds
          </span>
        </p>
      ))}
    </div>
  )
}
