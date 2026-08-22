import { CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** One full-page or in-panel state, so loading, empty and unavailable screens keep the same hierarchy. */
export function PageState({
  title,
  explanation,
  eyebrow = 'Praetorium',
  icon: Icon = CircleAlert,
  loading = false,
  action,
  className = '',
  headingLevel = 1,
}: {
  title: string
  explanation: string
  eyebrow?: string
  icon?: LucideIcon
  loading?: boolean
  action?: ReactNode
  className?: string
  headingLevel?: 1 | 2
}) {
  const Mark = loading ? LoaderCircle : Icon
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div className={`${className} relative grid place-items-center overflow-hidden border border-edge bg-panel px-6 py-12 text-center`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
      <div className="relative grid max-w-md justify-items-center">
        <span className="grid size-14 place-items-center rounded-full border border-edge-strong bg-sunken text-parchment">
          <Mark className={`size-6 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </span>
        <p className="eyebrow mt-4 text-parchment">{eyebrow}</p>
        <Heading className="mt-1 text-2xl">{title}</Heading>
        <p className="mt-2 text-sm text-dim">{explanation}</p>
        {action ? <div className="mt-6 w-full">{action}</div> : null}
      </div>
    </div>
  )
}
