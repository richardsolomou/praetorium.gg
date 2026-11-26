import { createLink } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** The quiet way back up to the page this one belongs to, above the content. */
export const BackLink = createLink(function BackAnchor({ children, className, ...props }: ComponentProps<'a'>) {
  return (
    <a {...props} className={cn('group flex min-h-6 w-fit items-center gap-1 text-xs text-dim hover:text-bone', className)}>
      <ChevronLeft className="size-3.5" aria-hidden />
      <span className="quiet-link group-hover:border-current">{children}</span>
    </a>
  )
})
