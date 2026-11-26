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
    <div className={cn('grid place-items-center px-6 py-12 text-center', className)}>
      <div className="grid max-w-md justify-items-center">
        <Mark className={`size-6 text-faint ${loading ? 'animate-spin' : ''}`} aria-hidden />
        <Heading className="mt-4 text-xl font-semibold">{title}</Heading>
        <p className="mt-2 text-sm text-dim">{explanation}</p>
        {action ? <div className="mt-6 flex w-full justify-center">{action}</div> : null}
      </div>
    </div>
  )
}

/** A page still on its way: a quiet spinner, since what it is loading is already in the address and the nav. */
export function PageLoading() {
  return (
    <main className="grid w-full flex-1 place-items-center py-24">
      <output aria-label="Loading">
        <LoaderCircle className="size-6 animate-spin text-dim" aria-hidden />
      </output>
    </main>
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
