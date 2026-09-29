import { Link } from '@tanstack/react-router'
import { Check, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { NamedRosterDifferences } from '../../../core/rosterDifferences'
import { RosterDifferenceChips, RosterDifferenceList, type VariantSetup } from './RosterDifferences'

export type RosterVariant = { id: string; name: string }

/**
 * An owned list's place in its variant group, as one control beside the header's
 * actions: what this variant changes from its base, and every list to move to.
 */
export function RosterVariantMenu({
  current,
  variants,
  differences,
  setup,
  disabled,
}: {
  current: string
  /** The group, base first; a list with no variants has only itself. */
  variants: readonly RosterVariant[]
  differences: NamedRosterDifferences | null
  setup: VariantSetup
  /** Held while an edit is unsaved, so leaving cannot drop it. */
  disabled: boolean
}) {
  if (variants.length < 2) return null
  const position = variants.findIndex((variant) => variant.id === current) + 1

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={<Button variant="ghost" size="icon-sm" aria-label={`Variant ${position} of ${variants.length}`} />}
      >
        <Layers />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(32rem,75dvh)] w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-y-auto p-0">
        {differences ? (
          <section className="space-y-2 border-b border-edge p-3">
            <PopoverTitle className="text-xs text-dim">
              Changes from{' '}
              <Link to="/rosters/$id" params={{ id: differences.baseId }} className="font-semibold text-info hover:text-bone">
                {differences.baseName}
              </Link>
            </PopoverTitle>
            <RosterDifferenceChips differences={differences} setup={setup} />
            {differences.added.length || differences.removed.length ? <RosterDifferenceList differences={differences} /> : null}
          </section>
        ) : null}
        <nav aria-label="Variants" className="p-1">
          {variants.map((variant, index) => (
            <Link
              key={variant.id}
              to="/rosters/$id"
              params={{ id: variant.id }}
              aria-current={variant.id === current ? 'page' : undefined}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-raised aria-[current=page]:text-bone"
            >
              <Check className={`size-3.5 shrink-0 ${variant.id === current ? '' : 'invisible'}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{variant.name || 'Unnamed roster'}</span>
              {index === 0 ? <span className="eyebrow">Base</span> : null}
            </Link>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  )
}
