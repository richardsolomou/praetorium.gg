import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CountButton } from './Stepper'

export function ModelCounter({
  count,
  label,
  inputLabel,
  min = 1,
  max,
  disabled = false,
  compact = false,
  caption,
  maxAction = false,
  onChange,
}: {
  count: number | null
  label: string
  inputLabel: string
  min?: number
  max: number
  disabled?: boolean
  compact?: boolean
  caption?: string
  maxAction?: boolean
  onChange: (count: number) => void | Promise<unknown>
}) {
  const countText = count === null ? '' : String(count)
  const [draft, setDraft] = useState(countText)
  const [saving, setSaving] = useState(false)
  const pendingCount = useRef<number | null>(null)
  const focused = useRef(false)
  const revision = useRef(0)
  useEffect(() => {
    if (saving || (pendingCount.current !== null && count !== pendingCount.current)) return
    pendingCount.current = null
    if (!focused.current) setDraft(count === null ? '' : String(count))
  }, [count, saving])
  const value = Number(draft)
  const valid = draft.trim() !== '' && Number.isInteger(value) && value >= min && value <= max
  const current = valid ? value : count
  const save = async (models: number) => {
    const attempt = ++revision.current
    setDraft(String(models))
    if (models === count && pendingCount.current === null) return
    pendingCount.current = models
    setSaving(true)
    try {
      await onChange(models)
    } catch {
      if (revision.current === attempt) {
        pendingCount.current = null
        setDraft(countText)
      }
    } finally {
      if (revision.current === attempt) setSaving(false)
    }
  }
  const unavailable = disabled || count === null
  const counter = (
    <span
      className={`grid shrink-0 items-center ${compact ? 'w-14 max-w-full grid-cols-2 gap-1 @[18rem]:w-full @[18rem]:max-w-24 @[18rem]:grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] @[18rem]:gap-0.5' : 'grid-cols-[1.5rem_3.5rem_1.5rem] gap-1'}`}
    >
      <CountButton
        label={`Fewer ${label} models`}
        decrease
        repeat
        onClick={!unavailable && current !== null && current > min ? () => void save(current - 1) : undefined}
      />
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        aria-label={inputLabel}
        aria-busy={count === null}
        disabled={unavailable}
        value={draft}
        placeholder="—"
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          focused.current = false
          if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return
          if (valid) void save(value)
          else setDraft(countText)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setDraft(countText)
        }}
        className={`readout h-6 min-w-0 rounded-sm border border-edge-strong bg-transparent text-center outline-none [appearance:textfield] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${compact ? 'col-span-2 row-start-1 w-full px-0 text-xs @[18rem]:col-span-1 @[18rem]:row-auto' : 'w-14 px-1 text-sm'}`}
      />
      <CountButton
        label={`More ${label} models`}
        repeat
        onClick={!unavailable && current !== null && current < max ? () => void save(current + 1) : undefined}
      />
    </span>
  )
  return caption ? (
    <span className="flex min-w-0 flex-wrap items-center justify-between gap-2 @[15rem]:flex-col @[15rem]:items-center @[15rem]:gap-1">
      <span className="inline-flex h-4 items-center gap-1 text-xs text-dim">
        <span>{caption}</span>
        {maxAction ? (
          <Button
            variant="ghost"
            size="xs"
            className="h-4 px-1 text-[0.625rem] text-primary"
            aria-label={`Max ${label} models`}
            disabled={unavailable || current === max}
            onClick={() => void save(max)}
          >
            Max
          </Button>
        ) : null}
      </span>
      {counter}
    </span>
  ) : (
    counter
  )
}
