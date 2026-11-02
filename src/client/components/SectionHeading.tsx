import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A section's rubric with its count beside it: `detail` replaces the count readout at the right; `action` puts a control at the right. */
export function SectionHeading({
  title,
  count,
  detail,
  action,
  id,
  className,
}: {
  title: string
  count?: number
  detail?: ReactNode
  action?: ReactNode
  id?: string
  className?: string
}) {
  const tally = detail || count === undefined ? null : <span className="readout text-sm text-dim">{count}</span>
  if (!action)
    return (
      <h2 id={id} className={cn('rubric mb-3 flex min-h-8 items-center gap-3 text-bone', className)}>
        <span>{title}</span>
        {tally}
        {detail ? <span className="ml-auto">{detail}</span> : null}
      </h2>
    )
  return (
    <div className={cn('mb-3 flex min-h-8 flex-wrap items-center justify-between gap-3', className)}>
      <h2 id={id} className="rubric flex items-center gap-3 text-bone">
        <span>{title}</span>
        {tally}
        {detail}
      </h2>
      {action}
    </div>
  )
}
