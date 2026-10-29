import { cn } from '@/lib/utils'

/** What a battle did to a player's leaderboard rating, signed so a gain and a loss read apart without the colour. */
export function RatingChange({ change }: { change: number }) {
  return (
    <span
      title="Leaderboard rating change"
      className={cn('readout shrink-0 text-2xs', change > 0 ? 'text-achieved' : change < 0 ? 'text-rust' : 'text-faint')}
    >
      {change > 0 ? `+${change}` : change < 0 ? `−${-change}` : '±0'}
    </span>
  )
}
