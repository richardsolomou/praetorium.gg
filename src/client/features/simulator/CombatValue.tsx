import type { CombatResult } from '../../../core/combat'

export type CombatMetric = 'meanDamage' | 'meanKills' | 'uncappedKills' | 'wipe'

export const UNCAPPED_KILLS_EXPLANATION =
  'Models destroyed on average if the target had enough models to take every attack. Compares attackers that all usually destroy a small unit.'

export function formatCombatValue(result: Pick<CombatResult, CombatMetric> | undefined, metric: CombatMetric) {
  if (!result) return '—'
  return metric === 'wipe' ? `${(result.wipe * 100).toFixed(1)}%` : (result[metric]?.toFixed(2) ?? '—')
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
    <span data-combat-wipe={metric === 'wipe' ? '' : undefined} className={`readout ${className}`}>
      {formatCombatValue(result, metric)}
    </span>
  )
}
