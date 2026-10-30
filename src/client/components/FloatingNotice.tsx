import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A notice floating over the foot of the page, announced as it appears and left out of print. */
export function FloatingNotice({ className, ...props }: ComponentProps<'aside'>) {
  return (
    <aside
      aria-live="polite"
      data-print-hide
      {...props}
      className={cn(
        'fixed bottom-4 left-1/2 z-40 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 border border-edge-strong bg-panel p-2 text-sm shadow-lg',
        className,
      )}
    />
  )
}
