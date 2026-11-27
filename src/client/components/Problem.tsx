import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { errorMessage } from '../queryClient'

/** An announced failure: the message written as children, or the one `error` carries. */
export function Problem({ error, children, className }: { error?: unknown; children?: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn('text-sm text-destructive', className)}>
      {children ?? errorMessage(error)}
    </p>
  )
}
