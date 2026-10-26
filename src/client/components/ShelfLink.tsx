import { Link, type LinkComponentProps } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The link under a shelf to the whole list it shows a few of. */
export function ShelfLink({ className, children, ...props }: LinkComponentProps & { children: ReactNode }) {
  return (
    <Link {...props} className={cn('eyebrow inline-flex items-center gap-1 text-info hover:text-parchment', className)}>
      {children} <ChevronRight className="size-3.5" />
    </Link>
  )
}
