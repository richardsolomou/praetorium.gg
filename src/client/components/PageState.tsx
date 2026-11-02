import { CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

/** One full-page or in-panel state, so loading, empty and unavailable screens keep the same hierarchy. */
export function PageState({
  title,
  explanation,
  icon: Icon = CircleAlert,
  loading = false,
  action,
  className = '',
  headingLevel = 1,
}: {
  title: string
  explanation: string
  icon?: LucideIcon
  loading?: boolean
  action?: ReactNode
  className?: string
  headingLevel?: 1 | 2
}) {
  const Mark = loading ? LoaderCircle : Icon
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div
      className={cn(
        'relative grid place-items-center overflow-hidden rounded-2xl border border-dashed border-runner bg-sunken px-6 py-12 text-center',
        className,
      )}
    >
      <div className="construction-grid" />
      <div className="relative grid max-w-md justify-items-center">
        {/* The mark is a part still on its frame: a moulding with a runner leaving either side. */}
        <span className="relative grid size-16 place-items-center rounded-2xl border-2 border-runner bg-void text-parchment before:absolute before:top-1/2 before:right-full before:h-0.5 before:w-6 before:bg-runner after:absolute after:top-1/2 after:left-full after:h-0.5 after:w-6 after:bg-runner">
          <Mark className={`size-6 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </span>
        <Heading className="mt-5 text-2xl">{title}</Heading>
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
      <PageState {...props} className="flex-1 rounded-none border-0" />
    </main>
  )
}
