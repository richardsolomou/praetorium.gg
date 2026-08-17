import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

type Props = { title: string; count: number; children: ReactNode; empty?: string; defaultOpen?: boolean }

/**
 * A titled shelf with its count on the right, collapsible.
 *
 * The count is the point of the heading: a roster is read by whether it has the
 * right number of characters and battleline, not by scrolling to the bottom to
 * find out. An empty shelf still says its name, so its absence is visible.
 */
export function Section({ title, count, children, empty, defaultOpen = true }: Props) {
  return (
    <Collapsible render={<section />} defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between py-1.5">
        <span className="rubric">{title}</span>
        <span className="flex items-center gap-1.5">
          <span className="readout text-sm text-dim">{count}</span>
          <ChevronDown className="size-4 text-faint transition-transform group-data-panel-open:rotate-180" aria-hidden />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {count ? <div className="space-y-1.5 pb-3">{children}</div> : <p className="pb-3 text-xs text-faint">{empty}</p>}
      </CollapsibleContent>
    </Collapsible>
  )
}
