import { type ReactNode, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { RuleText } from './RuleText'

/** Hover opens and closes the tooltip; a pinning press keeps it open until the reader presses outside or escapes. */
export function usePressTooltip() {
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)
  return {
    open,
    onOpenChange: (nextOpen: boolean, details: { reason: string }) => {
      if (!nextOpen && pinned.current && details.reason !== 'outside-press' && details.reason !== 'escape-key') return
      if (!nextOpen) pinned.current = false
      setOpen(nextOpen)
    },
    show: (pin: boolean) => {
      pinned.current = pin
      setOpen(true)
    },
    hide: () => {
      pinned.current = false
      setOpen(false)
    },
  }
}

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
  const { open, onOpenChange, show, hide } = usePressTooltip()

  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <button
            type="button"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                event.stopPropagation()
                hide()
              }
            }}
            aria-label={label}
            onClick={(event) => show(event.detail > 0)}
            className={cn('inline-flex items-center justify-center cursor-help underline decoration-dotted underline-offset-2', className)}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        role="tooltip"
        side="bottom"
        sideOffset={6}
        className="z-50 block max-h-[min(18rem,calc(100vh-1rem))] w-66 max-w-[calc(100vw-1rem)] overflow-hidden p-0 text-left"
      >
        <strong className="block border-b border-edge px-2.5 py-1.5 text-xs font-bold tracking-label text-bone uppercase">{title}</strong>
        {body ? (
          <div className="max-h-56 overflow-y-auto px-2.5 py-1.5 font-rules text-xs text-dim">
            {typeof body === 'string' ? <RuleText text={body} className="mt-0 text-xs" authored /> : body}
          </div>
        ) : null}
        {note ? <span className="eyebrow block border-t border-edge px-2.5 py-1 text-faint">{note}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}
