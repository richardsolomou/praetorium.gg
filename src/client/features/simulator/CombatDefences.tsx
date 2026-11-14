import { Button } from '@/components/ui/button'
import { ArrowUp } from 'lucide-react'
import { ProfileGrid } from '../../components/DatasheetProfiles'
import { combatGroupProtection, type CombatInput, type CombatTargetGroup } from '../../../core/combat'
import { combatUnitTarget } from '../../../core/combatUnit'
import type { CombatantSnapshot } from '../../../core/combatMatchup'

export function CombatDefences({
  unit,
  feelNoPain,
  configured,
  onAllocateEarlier,
}: {
  unit: CombatantSnapshot | null
  feelNoPain?: number | null
  configured?: { target: CombatInput['target']; labels: readonly string[] }
  onAllocateEarlier?: (index: number) => void
}) {
  const printed = configured ?? (unit ? combatUnitTarget(unit) : null)
  const target = printed?.target ?? null
  const fnp = feelNoPain === undefined ? target?.feelNoPain : feelNoPain
  const groups = target?.groups ?? []
  const values = (group: CombatTargetGroup | undefined) => {
    const protection = group && target ? combatGroupProtection(target, group).feelNoPain : null
    const threshold = Math.min(protection ?? 7, fnp ?? 7)
    return [
      { name: 'T', value: group ? String(group.toughness) : '—' },
      { name: 'Sv', value: group ? `${group.save}+` : '—' },
      { name: 'W', value: group ? String(group.wounds) : '—' },
      { name: 'InSv', value: group?.invulnerable ? `${group.invulnerable}+` : '—' },
      { name: 'FNP', value: threshold < 7 ? `${threshold}+` : '—' },
    ]
  }
  if (groups.length < 2)
    return (
      <div className="px-3 pb-3 sm:px-4 sm:pb-4 [&_[data-characteristic]]:rounded-none [&_[data-characteristic]]:border-0 [&_[data-characteristic]]:bg-transparent [&_[data-characteristic]]:shadow-none [&_[data-characteristic]>p:last-child]:text-xl [&_[data-characteristic]>p:last-child]:font-semibold [&_[data-slot=profile-grid]]:gap-0 [&_[data-slot=profile-grid]]:divide-x [&_[data-slot=profile-grid]]:divide-edge [&_[data-slot=profile-grid]]:rounded-lg [&_[data-slot=profile-grid]]:border [&_[data-slot=profile-grid]]:border-edge [&_[data-slot=profile-grid]]:bg-sunken">
        <ProfileGrid values={values(groups[0])} columns={5} />
      </div>
    )
  return (
    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
      <table className="w-full table-fixed rounded-lg border border-edge bg-sunken text-center">
        <thead>
          <tr className="eyebrow">
            <th className="w-1/3 px-2 py-1.5 text-left font-normal">{onAllocateEarlier ? 'Order' : 'Models'}</th>
            {values(groups[0]).map((value) => (
              <th key={value.name} className="px-1 py-1.5 font-normal">
                {value.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const label = printed?.labels[index]
            return (
              <tr key={label ?? index} className="border-t border-edge">
                <td className="px-2 py-1.5 text-left text-xs text-dim">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate">
                      {onAllocateEarlier ? `${index + 1}. ` : ''}
                      {label} ×{group.models}
                    </span>
                    {onAllocateEarlier &&
                    index > 0 &&
                    Boolean(group.character) === Boolean(groups[index - 1]!.character) &&
                    Boolean(group.damage) === Boolean(groups[index - 1]!.damage) ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto shrink-0"
                        aria-label={`Allocate to ${label} earlier`}
                        onClick={() => onAllocateEarlier(index)}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </td>
                {values(group).map((value) => (
                  <td key={value.name} className="readout px-1 py-1.5 text-base">
                    {value.value}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
