import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type KeywordRule = { name: string; description: string }

export function Keyword({ name, rules, className = '' }: { name: string; rules: KeywordRule[]; className?: string }) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const descriptionId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const rule = rules.find((candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (!rule) return <span className={className}>{name}</span>
  const open = pinned || hovered || focused
  const bounds = trigger.current?.getBoundingClientRect()
  const above = bounds ? bounds.bottom + 200 > window.innerHeight : false

  return (
    <span className="inline-block">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-describedby={descriptionId}
        onClick={() => setPinned((current) => !current)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`${className} cursor-help underline decoration-dotted underline-offset-2`}
      >
        {name}
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
              <strong className="block font-semibold">{name}</strong>
              <span className="mt-1 block whitespace-pre-line text-dim">{rule.description.replaceAll(/\^\^|\*/g, '')}</span>
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}

export function KeywordList({ value, rules, className }: { value: string; rules: KeywordRule[]; className?: string }) {
  return value.split(',').map((part, index) => {
    const name = part.trim()
    return (
      <span key={name}>
        {index ? ', ' : null}
        <Keyword name={name} rules={rules} className={className} />
      </span>
    )
  })
}
