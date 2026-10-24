import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

type Props = {
  title: string
  count: number
  children: ReactNode
  defaultOpen?: boolean
  /** What the shelf's units cost together, beside its title. */
  points?: number
}

/**
 * A titled shelf with its count on the right, collapsible.
 *
 * The count is the point of the heading: a roster is read by whether it has the
 * right number of units in each category, not by scrolling to the bottom to find
 * out.
 */
export function Section({ title, count, children, defaultOpen = true, points }: Props) {
  return (
    <Collapsible render={<section />} defaultOpen={defaultOpen}>
      <div className="flex w-full items-center gap-2 py-1.5">
        <h2 className="rubric">{title}</h2>
        {points === undefined ? null : <span className="readout text-xs text-dim">{points} pts</span>}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="readout text-sm text-dim">{count}</span>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label={`Toggle ${title}`} className="group text-faint" />}
          >
            <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" aria-hidden />
          </CollapsibleTrigger>
        </span>
      </div>
      <CollapsibleContent>
        <div className="space-y-1.5 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
