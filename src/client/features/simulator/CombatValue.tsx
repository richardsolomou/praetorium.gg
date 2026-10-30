import type { CombatResult } from '../../../core/combat'
import { cn } from '@/lib/utils'

export type CombatMetric = 'meanDamage' | 'meanKills' | 'uncappedKills' | 'wipe'

export const UNCAPPED_KILLS_EXPLANATION =
  'Models destroyed on average if the target had enough models to take every attack. Compares attackers that all usually destroy a small unit.'

/** A chance as a percentage, with two decimals below one percent so rare outcomes don't read as zero. */
export const chanceLabel = (value: number) => {
  const chance = value * 100
  if (chance > 0 && chance < 0.01) return '<0.01%'
  return `${chance.toFixed(chance > 0 && chance < 1 ? 2 : 1)}%`
}

export function formatCombatValue(result: Pick<CombatResult, CombatMetric> | undefined, metric: CombatMetric) {
  if (!result) return '—'
  return metric === 'wipe' ? chanceLabel(result.wipe) : (result[metric]?.toFixed(2) ?? '—')
}

export function CombatValue({
  result,
  metric,
  className = '',
}: {
  result?: Pick<CombatResult, CombatMetric>
  metric: CombatMetric
  className?: string
}) {
  return (
    <span data-combat-wipe={metric === 'wipe' ? '' : undefined} className={cn('readout', className)}>
      {formatCombatValue(result, metric)}
    </span>
  )
}
