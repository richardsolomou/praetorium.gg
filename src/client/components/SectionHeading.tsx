import type { ReactNode } from 'react'

export function SectionHeading({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  const readout = count === undefined ? null : <span className="readout">{count}</span>
  if (!action)
    return (
      <h2 className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
        {title} {readout}
      </h2>
    )
  return (
    <div className="mb-2 flex min-h-8 items-end justify-between gap-3 border-b border-edge pb-2">
      <h2 className="rubric flex items-baseline gap-2">
        {title} {readout}
      </h2>
      {action}
    </div>
  )
}
