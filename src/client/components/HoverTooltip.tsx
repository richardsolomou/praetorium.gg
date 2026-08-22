/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- the tooltip tracks hover only so readable content stays open across the trigger gap */
import { type ReactNode, useLayoutEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** The width the bubble is drawn at, which is also what keeps it inside the viewport. */
const WIDTH = 264
/** The gap between the trigger and the bubble. */
const GAP = 6
/** How close to the edge of the window the bubble may sit. */
const MARGIN = 8

type Placement = { left: number; top: number; above: boolean }

/**
 * Everything this interface explains on hover, drawn one way.
 *
 * A tooltip here always says the same three things in the same order — what it is
 * about, what it says, and where that came from — because the two things that use
 * it are answering the same question: a keyword names a rule, and a modified
 * characteristic names what modified it. Free-form content is what let the two
 * drift apart, so the shape is the API and the caller fills it in.
 */
export function HoverTooltip({
  children,
  title,
  body,
  note,
  className = '',
  label,
}: {
  /** The text the tooltip hangs off, which is also its accessible name. */
  children: ReactNode
  /** What the tooltip is about: a rule's name, or the characteristic that changed. */
  title: string
  /** The rule in full, or the change itself. */
  body?: ReactNode
  /** Where it came from: the enhancement, upgrade or detachment responsible. */
  note?: string
  className?: string
  /** An accessible name for a trigger its own text does not describe. */
  label?: string
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const descriptionId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = hovered || focused
  const keepOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setHovered(true)
  }
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHovered(false), 100)
  }

  // Measured rather than guessed, and again on every scroll: a bubble tall enough to
  // fall off the bottom of the window belongs above its trigger instead, a rule long
  // enough to fill the window is pinned inside it, and a list that scrolls under an
  // open tooltip would otherwise leave it behind.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    const place = () => {
      const bounds = trigger.current?.getBoundingClientRect()
      if (!bounds) return
      const height = bubble.current?.offsetHeight ?? 0
      const above = bounds.bottom + GAP + height > window.innerHeight && bounds.top - GAP - height > MARGIN
      const centre = bounds.left + bounds.width / 2
      const room = WIDTH / 2 + MARGIN
      const wanted = above ? bounds.top - GAP : bounds.bottom + GAP
      const lowest = above ? window.innerHeight - MARGIN : Math.max(window.innerHeight - height - MARGIN, MARGIN)
      setPlacement({
        left: Math.min(Math.max(centre, room), Math.max(window.innerWidth - room, room)),
        top: Math.min(Math.max(wanted, above ? height + MARGIN : MARGIN), lowest),
        above,
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <span className="inline-flex align-baseline">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-describedby={open ? descriptionId : undefined}
        onMouseEnter={keepOpen}
        onMouseLeave={closeSoon}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`${className} inline-flex cursor-help items-center justify-center underline decoration-dotted underline-offset-2`}
      >
        {children}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={bubble}
              id={descriptionId}
              role="tooltip"
              style={{
                width: WIDTH,
                left: placement?.left ?? 0,
                top: placement?.top ?? 0,
                transform: placement?.above ? 'translate(-50%, -100%)' : 'translateX(-50%)',
                // Nowhere until it has been measured, rather than somewhere wrong.
                visibility: placement ? 'visible' : 'hidden',
              }}
              onMouseEnter={keepOpen}
              onMouseLeave={closeSoon}
              className="fixed z-50 flex max-h-[min(18rem,calc(100vh-1rem))] max-w-[calc(100vw-1rem)] flex-col overflow-hidden border border-edge-strong bg-raised text-left shadow-xl"
            >
              <strong className="block shrink-0 border-b border-edge px-2.5 py-1.5 text-xs font-bold tracking-[0.06em] text-bone uppercase">
                {title}
              </strong>
              {body ? (
                <span className="block min-h-0 overflow-y-auto px-2.5 py-1.5 font-rules text-xs whitespace-pre-line text-dim">{body}</span>
              ) : null}
              {note ? <span className="eyebrow block shrink-0 border-t border-edge px-2.5 py-1 text-faint">{note}</span> : null}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
