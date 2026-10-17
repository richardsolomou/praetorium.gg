import { CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

/** One full-page or in-panel state, so loading, empty and unavailable screens keep the same hierarchy. */
export function PageState({
  title,
  explanation,
  eyebrow,
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
    <div className={cn('relative grid place-items-center overflow-hidden border border-edge bg-panel px-6 py-12 text-center', className)}>
      <div className="plot-grid" />
      <div className="relative grid max-w-md justify-items-center">
        <span className="grid size-14 place-items-center rounded-full border border-edge-strong bg-sunken text-parchment">
          <Mark className={`size-6 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </span>
        {eyebrow ? <p className="eyebrow mt-4 text-parchment">{eyebrow}</p> : null}
        <Heading className={`${eyebrow ? 'mt-1' : 'mt-4'} text-2xl`}>{title}</Heading>
        <p className="mt-2 text-sm text-dim">{explanation}</p>
        {action ? <div className="mt-6 flex w-full justify-center">{action}</div> : null}
      </div>
    </div>
  )
}

/** A page whose whole content is one state. */
export function FullPageState(props: Omit<ComponentProps<typeof PageState>, 'className'>) {
  return (
    <main className="flex w-full">
      <PageState {...props} className="flex-1 border-x-0 border-t-0" />
    </main>
  )
}
