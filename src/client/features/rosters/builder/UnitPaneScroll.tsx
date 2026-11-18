import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function UnitPaneScroll({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      data-slot="scroll-area-viewport"
      // Chromium focuses native scrollers automatically; Safari needs a tab stop for keyboard scrolling.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className={cn(
        'min-w-0 max-w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
        className,
      )}
    >
      {children}
    </div>
  )
}
