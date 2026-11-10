import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'

export function CollectionCard({
  name,
  sheet,
  photo,
  action,
  description,
  children,
  className,
  ...props
}: ComponentProps<'li'> & {
  name: string
  sheet?: { catalogueId: string; slug: string; presentation?: FactionPresentation }
  photo?: ReactNode
  action?: ReactNode
  description?: ReactNode
}) {
  return (
    <li {...props} className={cn('@container/card part flex flex-col gap-2.5 p-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {photo ??
          (sheet?.presentation ? (
            <span className="flex size-6 shrink-0 items-center justify-center">
              <FactionMark faction={sheet.presentation} size="sm" />
            </span>
          ) : null)}
        <span className="min-w-[6rem] flex-1 break-words">
          {sheet ? (
            <FactionReferenceLink
              to="/factions/$catalogueId/datasheets/$entryId"
              params={{ catalogueId: sheet.catalogueId, entryId: sheet.slug }}
              className="text-sm font-semibold text-bone uppercase underline-offset-4 hover:text-info hover:underline"
            >
              {name}
            </FactionReferenceLink>
          ) : (
            <span className="text-sm text-dim">{name}</span>
          )}
          {description ? <span className="mt-0.5 block text-xs text-dim">{description}</span> : null}
        </span>
        {action}
      </div>
      {children}
    </li>
  )
}

export function CollectionCardGrid(props: ComponentProps<'ul'>) {
  return <ul {...props} className="grid grid-cols-1 gap-2 @xl/army:grid-cols-2 @4xl/army:grid-cols-3" />
}
