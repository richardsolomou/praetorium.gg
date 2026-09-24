import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OnboardingTarget } from '../onboardingTargets'

/** Minus, the number, plus, for counts changed one at a time. */
export function Stepper({
  label,
  count,
  countLabel,
  onboarding,
  onAdd,
  onRemove,
}: {
  label: string
  count: number
  countLabel: string
  onboarding?: OnboardingTarget
  onAdd?: () => void
  onRemove?: () => void
}) {
  return (
    <span data-onboarding={onboarding} className="grid shrink-0 grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
      <CountButton label={`Fewer ${label}`} decrease onClick={onRemove} />
      <span className="readout text-center text-sm tabular-nums" aria-label={countLabel}>
        {count}
      </span>
      <CountButton label={`More ${label}`} onClick={onAdd} />
    </span>
  )
}

export function CountButton({ label, decrease = false, onClick }: { label: string; decrease?: boolean; onClick?: () => void }) {
  const color = decrease
    ? 'border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive dark:border-destructive/60 dark:bg-destructive/15 dark:hover:bg-destructive/25'
    : 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary dark:border-primary/60 dark:bg-primary/15 dark:hover:bg-primary/25'
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={`size-6 ${onClick ? color : ''}`}
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
    >
      {decrease ? <Minus strokeWidth={2.5} /> : <Plus strokeWidth={2.5} />}
    </Button>
  )
}
