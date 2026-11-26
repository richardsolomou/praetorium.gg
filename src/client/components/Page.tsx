import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The band every top-level page opens with: the page's own name and a line on what it is for, with the page's primary
 * actions beside them and a mark such as an avatar before them.
 */
export function PageHeader({
  title,
  description,
  introduction = false,
  actions,
  help,
  media,
  children,
  tint,
}: {
  title: ReactNode
  description?: ReactNode
  /** The description only introduces the page, so a phone leaves it out and gives the room to the list below. */
  introduction?: boolean
  actions?: ReactNode
  /** The page's guide, kept out of the way in the band's top corner as a dialog's is. */
  help?: ReactNode
  media?: ReactNode
  /** Anything else the band carries, such as chips or a keyword row, drawn under the title row. */
  children?: ReactNode
  /** A faction's colour along the top edge, on the pages that belong to it. */
  tint?: string
}) {
  return (
    <header
      className={cn('relative overflow-hidden border-b border-edge bg-masthead', tint && 'border-t-[3px]')}
      style={tint ? { borderTopColor: tint } : undefined}
    >
      <div className="relative mx-auto max-w-5xl px-3 pt-6 pb-5 sm:px-4 sm:pt-8 sm:pb-6">
        {help ? <div className="absolute top-1 right-1.5 sm:top-2.5 sm:right-2.5">{help}</div> : null}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            {media}
            <div className="min-w-0">
              <h1 className="font-display text-3xl leading-tight font-bold break-words normal-case sm:text-4xl">{title}</h1>
              {description ? (
                <p className={cn('mt-1.5 max-w-2xl text-base text-dim', introduction && 'max-sm:hidden')}>{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </header>
  )
}

/** The reading column under a page header: one width and one gutter for every page. */
export function PageContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-5xl px-3 pt-4 pb-8 sm:px-4', className)}>{children}</div>
}
