import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import type { OnboardingTarget } from '../onboardingTargets'

/** Minus, the number, plus; given choices, the number also picks a count directly. */
export function Stepper({
  label,
  count,
  countLabel,
  loading = false,
  onboarding,
  onAdd,
  onRemove,
  choices,
  onChoose,
}: {
  label: string
  count: number | null
  countLabel: string
  loading?: boolean
  onboarding?: OnboardingTarget
  onAdd?: () => void
  onRemove?: () => void
  choices?: readonly number[]
  onChoose?: (count: number) => void
}) {
  return (
    <span data-onboarding={onboarding} className="grid shrink-0 grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
      <CountButton label={`Fewer ${label}`} decrease onClick={onRemove} />
      {count !== null && !loading && choices?.length && onChoose ? (
        <Select value={count} onValueChange={(chosen) => chosen !== null && chosen !== count && onChoose(chosen)}>
          {/* The generated trigger always appends a chevron, which leaves no room in the stepper's narrow middle cell. */}
          <SelectPrimitive.Trigger
            aria-label={countLabel}
            className="readout flex h-6 w-8 items-center justify-center rounded-sm border border-edge-strong text-sm transition-colors outline-none hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SelectValue className="flex-none">{count}</SelectValue>
          </SelectPrimitive.Trigger>
          <SelectContent className="min-w-16">
            {choices.map((choice) => (
              <SelectItem key={choice} value={choice} className="readout">
                {choice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="readout text-center text-sm leading-6" aria-label={countLabel} aria-busy={loading}>
          {loading ? <span aria-hidden className="inline-block h-4 w-5 animate-pulse bg-muted align-middle" /> : (count ?? '—')}
        </span>
      )}
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
