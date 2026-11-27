import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The mark that says a row opens: before its label, pointing at it while shut and down once open, whether it sits in a
 * `<details>` summary or a Collapsible trigger, so every disclosure in the app reads the same at a glance.
 */
export function DisclosureChevron({
  open,
  className,
}: {
  /** For a toggle that holds its own state rather than a details or Collapsible. */ open?: boolean
  className?: string
}) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        'size-4 shrink-0 text-dim transition-transform [[data-panel-open]_&]:rotate-90 [details[open]>summary_&]:rotate-90',
        open && 'rotate-90',
        className,
      )}
    />
  )
}
