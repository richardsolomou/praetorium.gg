import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A section's rubric: `detail` replaces the count readout at the right; `action` puts a control beside the heading. */
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
  const trailing = detail ?? (count === undefined ? null : <span className="readout">{count}</span>)
  if (!action)
    return (
      <h2 id={id} className={cn('rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2', className)}>
        <span>{title}</span>
        {trailing}
      </h2>
    )
  return (
    <div className={cn('mb-2 flex min-h-8 items-end justify-between gap-3 border-b border-edge pb-2', className)}>
      <h2 id={id} className="rubric flex items-baseline gap-2">
        <span>{title}</span>
        {trailing}
      </h2>
      {action}
    </div>
  )
}
