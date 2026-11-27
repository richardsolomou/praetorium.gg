import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { errorMessage } from '../queryClient'

/** Asks whoever handles feedback to report an error, with its message as the event's detail. */
export const REPORT_PROBLEM_EVENT = 'praetorium:report-problem'

/**
 * An announced failure: the message written as children, or the one `error` carries. A caught error offers to report
 * itself, since the player is never closer to knowing what went wrong than when it happens.
 */
export function Problem({
  error,
  children,
  reportable = children === undefined,
  className,
}: {
  error?: unknown
  children?: ReactNode
  reportable?: boolean
  className?: string
}) {
  const message = errorMessage(error)
  return (
    <p role="alert" className={cn('text-sm text-destructive', className)}>
      {children ?? message}
      {reportable ? (
        <>
          {' '}
          <button
            type="button"
            className="whitespace-nowrap text-info underline-offset-2 hover:text-parchment hover:underline"
            onClick={() => window.dispatchEvent(new CustomEvent(REPORT_PROBLEM_EVENT, { detail: message }))}
          >
            Report this
          </button>
        </>
      ) : null}
    </p>
  )
}
