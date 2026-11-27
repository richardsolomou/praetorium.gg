import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DisclosureChevron } from '../../../components/DisclosureChevron'

type Props = {
  title: string
  count: number
  children: ReactNode
  defaultOpen?: boolean
  /** Held by the caller, for a shelf that can empty and come back without forgetting whether it was open. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** What the shelf's units cost together, a figure at the right of its heading; a shelf priced this way counts units. */
  points?: number
  /** Ruled lines in one panel under a small heading, for a roster read as a list. */
  list?: boolean
}

/**
 * A titled shelf with its count beside the title, collapsible.
 *
 * The count is the point of the heading: a roster is read by whether it has the
 * right number of units in each category, not by scrolling to the bottom to find
 * out.
 */
export function Section({ title, count, children, defaultOpen = true, open, onOpenChange, points, list = false }: Props) {
  return (
    <Collapsible render={<section />} defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
      {/* Points come before the count in reading order and after it on screen, so the figure sits at the right edge. */}
      <div className={`flex w-full items-baseline gap-2 ${list ? 'py-0.5' : 'border-b border-parchment/60 pt-3 pb-1.5'}`}>
        <h2 className={list ? 'eyebrow text-dim' : 'font-display text-xl leading-tight font-bold text-bone'}>{title}</h2>
        {points === undefined ? null : (
          <span className="figure readout order-2 ml-auto text-lg leading-none text-dim">
            {points}
            <span className="sr-only"> pts</span>
          </span>
        )}
        <span className="order-1 text-xs text-faint">
          <span className="readout">{count}</span>
          {points === undefined ? null : ` ${count === 1 ? 'unit' : 'units'}`}
        </span>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Toggle ${title}`}
              className="group -order-1 -ml-1.5 self-center bg-transparent hover:text-bone aria-expanded:bg-transparent"
            />
          }
        >
          <DisclosureChevron />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className={list ? 'mb-3 divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-panel' : 'pt-2 pb-1'}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
