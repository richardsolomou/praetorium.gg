import { Minus, Plus } from 'lucide-react'
import { type PointerEvent, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { requestNativeHaptic } from '../nativeBridge'
import { holdPress } from './holdRepeat'

/**
 * Minus, the number, plus, each held to repeat; given choices, the number also picks a count directly.
 *
 * A disabled button fires no hover or tap, so why More is disabled is said next to it, placed so that reaching the cap
 * moves neither the stepper nor what sits around it.
 */
export function Stepper({
  label,
  count,
  countLabel,
  loading = false,
  onAdd,
  onRemove,
  blocked,
  reasonBeside = false,
  choices,
  onChoose,
  format = String,
  touch = false,
}: {
  label: string
  count: number | null
  countLabel: string
  loading?: boolean
  onAdd?: () => void
  onRemove?: () => void
  /** Why More is disabled, shown while it is: the cap and what sets it. */
  blocked?: string | null
  /**
   * Says the reason before the stepper, taking width from the flexible text it ends a row after, rather than hanging
   * it under the stepper, for rows packed too tightly to leave room below.
   */
  reasonBeside?: boolean
  choices?: readonly number[]
  onChoose?: (count: number) => void
  format?: (count: number) => string
  /** 44px targets, for a stepper pressed one-handed at the table. */
  touch?: boolean
}) {
  const reasonId = useId()
  const reason = onAdd ? null : blocked
  const stepper = (
    <span
      className={`relative grid shrink-0 items-center gap-1 ${touch ? 'grid-cols-[2.75rem_2.5rem_2.75rem]' : 'grid-cols-[1.5rem_2rem_1.5rem]'}`}
    >
      <CountButton label={`Fewer ${label}`} decrease repeat touch={touch} onClick={onRemove} />
      {count !== null && !loading && choices?.length && onChoose ? (
        <Select value={count} onValueChange={(chosen) => chosen !== null && chosen !== count && onChoose(chosen)}>
          {/* The generated trigger always appends a chevron, which leaves no room in the stepper's narrow middle cell. */}
          <SelectPrimitive.Trigger
            aria-label={countLabel}
            className={`readout flex ${touch ? 'h-11 w-10' : 'h-6 w-8'} items-center justify-center rounded-md border border-runner text-sm transition-colors outline-none hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`}
          >
            <SelectValue className="flex-none">{format(count)}</SelectValue>
          </SelectPrimitive.Trigger>
          <SelectContent className="min-w-16">
            {choices.map((choice) => (
              <SelectItem key={choice} value={choice} className="readout">
                {format(choice)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="readout text-center text-sm leading-6 select-none" aria-label={countLabel} aria-busy={loading}>
          {loading ? (
            <span aria-hidden className="inline-block h-4 w-5 animate-pulse bg-muted align-middle" />
          ) : count === null ? (
            '—'
          ) : (
            format(count)
          )}
        </span>
      )}
      <CountButton label={`More ${label}`} repeat touch={touch} onClick={onAdd} describedBy={reason ? reasonId : undefined} />
      {reason && !reasonBeside ? <BlockedReason id={reasonId}>{reason}</BlockedReason> : null}
    </span>
  )
  return reasonBeside && reason ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <BlockedReason id={reasonId} beside>
        {reason}
      </BlockedReason>
      {stepper}
    </span>
  ) : (
    stepper
  )
}

/** Below, it hangs under its positioned counter, right-aligned to More, taking no space, so its row needs room under it. */
export function BlockedReason({ id, beside = false, children }: { id: string; beside?: boolean; children: string }) {
  return (
    <span
      id={id}
      className={`text-right text-2xs text-discarded ${beside ? '' : 'absolute top-full right-0 mt-0.5 leading-none whitespace-nowrap'}`}
    >
      {children}
    </span>
  )
}

export function CountButton({
  label,
  decrease = false,
  repeat = false,
  touch = false,
  onClick,
  describedBy,
}: {
  label: string
  decrease?: boolean
  touch?: boolean
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
        if (!step) return false
        step()
        requestNativeHaptic('selection')
        return true
      })
  }
  const color = decrease
    ? 'border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive dark:border-destructive/60 dark:bg-destructive/15 dark:hover:bg-destructive/25'
    : 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary dark:border-primary/60 dark:bg-primary/15 dark:hover:bg-primary/25'
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={`${touch ? 'size-11' : 'size-6'} ${repeat ? 'touch-manipulation [-webkit-touch-callout:none]' : ''} ${onClick ? color : ''}`}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={!onClick}
      onPointerDown={hold}
      onPointerLeave={press.release}
      onContextMenu={repeat ? (event) => event.preventDefault() : undefined}
      onClick={(event) => {
        if (!press.click(event.detail) || !onClick) return
        onClick()
        requestNativeHaptic('selection')
      }}
    >
      {decrease ? <Minus strokeWidth={2.5} /> : <Plus strokeWidth={2.5} />}
    </Button>
  )
}
