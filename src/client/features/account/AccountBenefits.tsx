import { cn } from '@/lib/utils'

const BENEFITS = ['As many rosters as you want', 'Your rosters and battles on every device', 'Your record on the leaderboard'] as const

/** What a free account gives a player over the one roster a device keeps without one. */
export function AccountBenefits({ className }: { className?: string }) {
  return (
    <ul className={cn('list-disc space-y-1 pl-5 text-sm text-dim', className)}>
      {BENEFITS.map((benefit) => (
        <li key={benefit}>{benefit}</li>
      ))}
    </ul>
  )
}
