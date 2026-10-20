import { useEffect, useRef, useState } from 'react'
import { CountButton } from './Stepper'

export function ModelCounter({
  count,
  label,
  inputLabel,
  min = 1,
  max,
  disabled = false,
  compact = false,
  onChange,
}: {
  count: number | null
  label: string
  inputLabel: string
  min?: number
  max: number
  disabled?: boolean
  compact?: boolean
  onChange: (count: number) => void | Promise<unknown>
}) {
  const [draft, setDraft] = useState(count === null ? '' : String(count))
  const focused = useRef(false)
  const revision = useRef(0)
  useEffect(() => {
    if (!focused.current) setDraft(count === null ? '' : String(count))
  }, [count])
  const value = Number(draft)
  const valid = draft.trim() !== '' && Number.isInteger(value) && value >= min && value <= max
  const current = valid ? value : count
  const save = async (models: number) => {
    const attempt = ++revision.current
    setDraft(String(models))
    if (models === count) return
    try {
      await onChange(models)
    } catch {
      if (revision.current === attempt) setDraft(count === null ? '' : String(count))
    }
  }
  const unavailable = disabled || count === null
  return (
    <span
      className={`grid shrink-0 items-center ${compact ? 'w-14 max-w-full grid-cols-2 gap-1 @[18rem]:w-full @[18rem]:max-w-24 @[18rem]:grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] @[18rem]:gap-0.5' : 'grid-cols-[1.5rem_3.5rem_1.5rem] gap-1'}`}
    >
      <CountButton
        label={`Fewer ${label} models`}
        decrease
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
          else setDraft(count === null ? '' : String(count))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setDraft(count === null ? '' : String(count))
        }}
        className={`readout h-6 min-w-0 rounded-sm border border-edge-strong bg-transparent text-center outline-none [appearance:textfield] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${compact ? 'col-span-2 row-start-1 w-full px-0 text-xs @[18rem]:col-span-1 @[18rem]:row-auto' : 'w-14 px-1 text-sm'}`}
      />
      <CountButton
        label={`More ${label} models`}
        onClick={!unavailable && current !== null && current < max ? () => void save(current + 1) : undefined}
      />
    </span>
  )
}
