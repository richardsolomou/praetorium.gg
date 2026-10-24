import { Minus, Plus } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import type { OnboardingTarget } from '../onboardingTargets'
import { holdPress } from './holdRepeat'

/** Minus, the number, plus, each held to repeat; given choices, the number also picks a count directly. */
export function Stepper({
  label,
  count,
  countLabel,
  loading = false,
  onboarding,
  onAdd,
  onRemove,
  addDescribedBy,
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
  /** The element saying why More is disabled. */
  addDescribedBy?: string
  choices?: readonly number[]
  onChoose?: (count: number) => void
}) {
  return (
    <span data-onboarding={onboarding} className="grid shrink-0 grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
      <CountButton label={`Fewer ${label}`} decrease repeat onClick={onRemove} />
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
        <span className="readout text-center text-sm leading-6 select-none" aria-label={countLabel} aria-busy={loading}>
          {loading ? <span aria-hidden className="inline-block h-4 w-5 animate-pulse bg-muted align-middle" /> : (count ?? '—')}
        </span>
      )}
      <CountButton label={`More ${label}`} repeat onClick={onAdd} describedBy={addDescribedBy} />
    </span>
  )
}

export function CountButton({
  label,
  decrease = false,
  repeat = false,
  onClick,
  describedBy,
}: {
  label: string
  decrease?: boolean
  /** Holding the button keeps stepping until it is released or the step runs out. */
  repeat?: boolean
  onClick?: () => void
  describedBy?: string
}) {
  const latest = useRef(onClick)
  useEffect(() => {
    latest.current = onClick
  })
  const [press] = useState(holdPress)
  useEffect(() => press.release, [press])
  const hold = (event: PointerEvent) => {
    if (repeat && event.button === 0)
      press.press(event.pointerId, window, () => {
        const step = latest.current
        step?.()
        return Boolean(step)
      })
  }
  const color = decrease
    ? 'border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive dark:border-destructive/60 dark:bg-destructive/15 dark:hover:bg-destructive/25'
    : 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary dark:border-primary/60 dark:bg-primary/15 dark:hover:bg-primary/25'
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={`size-6 ${repeat ? 'touch-manipulation [-webkit-touch-callout:none]' : ''} ${onClick ? color : ''}`}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={!onClick}
      onPointerDown={hold}
      onPointerLeave={press.release}
      onContextMenu={repeat ? (event) => event.preventDefault() : undefined}
      onClick={(event) => press.click(event.detail) && onClick?.()}
    >
      {decrease ? <Minus strokeWidth={2.5} /> : <Plus strokeWidth={2.5} />}
    </Button>
  )
}
