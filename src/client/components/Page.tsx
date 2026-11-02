import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { OnboardingTarget } from '../onboardingTargets'

/**
 * The band every top-level page opens with, drawn on the booklet's construction
 * grid: the page's own name and a line on what it is for, with the page's primary
 * actions beside them and a mark such as an avatar before them.
 */
export function PageHeader({
  title,
  description,
  actions,
  media,
  children,
  tint,
  onboarding,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  media?: ReactNode
  /** Anything else the band carries, such as chips or a keyword row, drawn under the title row. */
  children?: ReactNode
  /** A faction's colour along the top edge, on the pages that belong to it. */
  tint?: string
  onboarding?: OnboardingTarget
}) {
  return (
    <header
      data-onboarding={onboarding}
      className={cn('masthead-bleed relative overflow-hidden border-b border-edge bg-masthead', tint && 'border-t-[3px] [--band-top:3px]')}
      style={tint ? { borderTopColor: tint } : undefined}
    >
      <div className="construction-grid" />
      <div className="relative mx-auto max-w-5xl px-3 pt-7 pb-5 sm:px-4 sm:pt-10 sm:pb-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            {media}
            <div className="min-w-0">
              <h1 className="text-3xl break-words sm:text-4xl">{title}</h1>
              {description ? <p className="mt-2 max-w-2xl text-sm text-dim">{description}</p> : null}
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
