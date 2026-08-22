import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Product-shaped rule help, with placement and interaction owned by Base UI. */
export function HoverTooltip({
  children,
  title,
  body,
  note,
  className = '',
  label,
}: {
  children: ReactNode
  title: string
  body?: ReactNode
  note?: string
  className?: string
  label?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <button
            type="button"
            aria-label={label}
            className={`${className} inline-flex cursor-help items-center justify-center underline decoration-dotted underline-offset-2`}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        role="tooltip"
        side="bottom"
        sideOffset={6}
        className="z-50 block max-h-[min(18rem,calc(100vh-1rem))] w-66 max-w-[calc(100vw-1rem)] overflow-hidden rounded-none border border-edge-strong bg-raised p-0 text-left text-dim shadow-xl"
      >
        <strong className="block border-b border-edge px-2.5 py-1.5 text-xs font-bold tracking-[0.06em] text-bone uppercase">
          {title}
        </strong>
        {body ? <span className="block max-h-56 overflow-y-auto px-2.5 py-1.5 font-rules text-xs whitespace-pre-line">{body}</span> : null}
        {note ? <span className="eyebrow block border-t border-edge px-2.5 py-1 text-faint">{note}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}
