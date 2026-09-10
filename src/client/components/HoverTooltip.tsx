import { type ReactNode, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RuleText } from './RuleText'

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
  const [open, setOpen] = useState(false)
  const openedByPress = useRef(false)

  return (
    <Tooltip
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && openedByPress.current && eventDetails.reason !== 'outside-press' && eventDetails.reason !== 'escape-key') return
        if (!nextOpen) openedByPress.current = false
        setOpen(nextOpen)
      }}
    >
      <TooltipTrigger
        closeOnClick={false}
        render={
          <button
            type="button"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                event.stopPropagation()
                openedByPress.current = false
                setOpen(false)
                return
              }
            }}
            aria-label={label}
            onClick={(event) => {
              openedByPress.current = event.detail > 0
              setOpen(true)
            }}
            className={`${className} inline-flex items-center justify-center cursor-help underline decoration-dotted underline-offset-2`}
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
        {body ? (
          <div className="max-h-56 overflow-y-auto px-2.5 py-1.5 font-rules text-xs">
            {typeof body === 'string' ? <RuleText text={body} className="mt-0 text-xs" /> : body}
          </div>
        ) : null}
        {note ? <span className="eyebrow block border-t border-edge px-2.5 py-1 text-faint">{note}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}
