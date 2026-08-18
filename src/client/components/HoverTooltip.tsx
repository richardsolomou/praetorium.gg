import { type ReactNode, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function HoverTooltip({
  children,
  content,
  className = '',
  label,
}: {
  children: ReactNode
  content: ReactNode
  className?: string
  label?: string
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const descriptionId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const open = hovered || focused
  const bounds = trigger.current?.getBoundingClientRect()
  const above = bounds ? bounds.bottom + 200 > window.innerHeight : false

  return (
    <span className="inline-flex align-baseline">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={descriptionId}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`${className} inline-flex items-center justify-center cursor-help underline decoration-dotted underline-offset-2`}
      >
        {children}
      </button>
      {open && bounds && typeof document !== 'undefined'
        ? createPortal(
            <span
              id={descriptionId}
              role="tooltip"
              style={{
                left: Math.min(Math.max(bounds.left + bounds.width / 2, 176), window.innerWidth - 176),
                top: above ? bounds.top - 6 : bounds.bottom + 6,
                transform: above ? 'translate(-50%, -100%)' : 'translateX(-50%)',
              }}
              className="fixed z-50 w-80 max-w-[80vw] border border-edge bg-raised p-3 text-left text-sm text-bone shadow-xl"
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
