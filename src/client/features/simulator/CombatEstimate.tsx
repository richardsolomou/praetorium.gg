import { useState } from 'react'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { CombatHistogram } from './CombatHistogram'

export function CombatEstimate({
  label,
  value,
  distribution,
  muted,
}: {
  label: string
  value: string
  distribution: number[]
  muted: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        aria-label={`${label}: ${value}. Show probabilities`}
        className={`readout inline-flex min-h-9 w-full items-center rounded-sm text-sm underline decoration-dotted decoration-current/40 underline-offset-4 outline-none hover:decoration-current focus-visible:ring-2 focus-visible:ring-primary sm:mt-1 sm:min-h-0 sm:text-xl ${muted ? 'text-dim' : 'text-primary'}`}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) setOpen(true)
        }}
      >
        {value}
      </PopoverTrigger>
      <PopoverContent
        initialFocus={false}
        finalFocus={false}
        side="top"
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] border border-edge bg-panel p-3 text-bone"
      >
        <PopoverTitle className="text-xs font-semibold text-dim">{label} probabilities</PopoverTitle>
        <CombatHistogram distribution={distribution} />
      </PopoverContent>
    </Popover>
  )
}
