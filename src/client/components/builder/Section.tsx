import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Props = { title: string; count: number; children: ReactNode; empty?: string }

/**
 * A titled shelf with its count on the right, collapsible.
 *
 * The count is the point of the heading: a roster is read by whether it has the
 * right number of characters and battleline, not by scrolling to the bottom to
 * find out. An empty shelf still says its name, so its absence is visible.
 */
export function Section({ title, count, children, empty }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <section>
      <Button
        variant="ghost"
        className="h-auto w-full justify-between rounded-none px-0 py-1.5 hover:bg-transparent"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="rubric">{title}</span>
        <span className="flex items-center gap-1.5">
          <span className="readout text-sm text-dim">{count}</span>
          {open ? <ChevronUp className="size-4 text-faint" aria-hidden /> : <ChevronDown className="size-4 text-faint" aria-hidden />}
        </span>
      </Button>
      {open ? count ? <div className="space-y-1.5 pb-3">{children}</div> : <p className="pb-3 text-xs text-faint">{empty}</p> : null}
    </section>
  )
}
