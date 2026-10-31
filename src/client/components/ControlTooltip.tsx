import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Hovers on a wrapper, since a disabled button gets no pointer events and could not say why it is disabled. */
export function ControlTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>{children}</TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
