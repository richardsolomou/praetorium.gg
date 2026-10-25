import { Boxes, Heart, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Account filters are icons, matching the row hearts and the Collection page, so a row of chips fits a phone. */
export const ACCOUNT_FILTERS = [
  {
    id: 'favourite',
    label: 'Favourites',
    hint: 'Show only your favourite datasheets',
    icon: Heart,
    empty: 'You have no favourite datasheets yet. Press the heart beside a datasheet to make it one.',
  },
  {
    id: 'owned',
    label: 'Owned',
    hint: 'Show only datasheets in your collection',
    icon: Boxes,
    empty: 'Nothing is in your collection yet. Add the datasheets you own on the Collection page.',
  },
] as const

export type AccountFilter = (typeof ACCOUNT_FILTERS)[number]['id']

export function FilterChip({
  label,
  hint,
  icon: Icon,
  pressed,
  onToggle,
  unavailable,
}: {
  label: string
  hint: string
  icon?: LucideIcon
  pressed: boolean
  onToggle: () => void
  unavailable?: string
}) {
  const [open, setOpen] = useState(false)
  const chip = 'rounded-sm border px-1.5 py-px text-2xs font-semibold tracking-label uppercase transition-colors'
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        closeOnClick={!unavailable}
        render={
          unavailable ? (
            <button
              type="button"
              aria-disabled="true"
              aria-label={label}
              onClick={() => setOpen(true)}
              className={`${chip} inline-flex h-7 min-w-7 cursor-not-allowed items-center justify-center border-edge text-faint`}
            />
          ) : (
            <Toggle
              variant="outline"
              size="sm"
              aria-label={Icon ? label : undefined}
              pressed={pressed}
              onPressedChange={onToggle}
              className={`${chip} ${
                pressed ? 'border-parchment bg-parchment/15 text-parchment' : 'border-edge-strong text-dim hover:border-dim hover:text-bone'
              }`}
            />
          )
        }
      >
        {Icon ? <Icon className={`size-3.5 ${pressed && Icon === Heart ? 'fill-current' : ''}`} /> : label}
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom" className="max-w-60 text-xs">
        {unavailable ?? hint}
      </TooltipContent>
    </Tooltip>
  )
}
