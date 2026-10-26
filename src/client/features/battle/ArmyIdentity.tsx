import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { routeSlug } from '../../../core/slug'
import { factionQuery } from '../../queries'
import { armyRulesRequest } from './sideRules'
import type { Army } from '../../sides'
import { FactionMark } from '../../components/FactionMark'

/** Reuse one army identity across setup and battle; frozen lists remain named even when their saved roster no longer exists. */
export function ArmyIdentity({
  army,
  leading,
  className = '',
}: {
  army: Army
  /** Read first, as one more part of the line. */
  leading?: ReactNode
  className?: string
}) {
  // One small read for this army's own faction, not the whole catalogue's worth.
  const { data } = useQuery({ ...factionQuery(army.roster?.built?.catalogueId ?? ''), enabled: Boolean(army.roster?.built) })
  const faction = data ? { ...data, edition: army.roster?.built?.edition ?? null } : undefined
  const { detachmentNames } = armyRulesRequest(army.roster)

  const parts = [
    leading ? (
      <span key="leading" className="truncate">
        {leading}
      </span>
    ) : null,
    faction ? (
      <FactionReferenceLink
        key="faction"
        to="/factions/$catalogueId"
        params={{ catalogueId: faction.slug }}
        aria-label={`${faction.displayName} faction`}
        title={faction.displayName}
        className="inline-flex min-w-0 items-center gap-1 text-bone hover:text-azure"
      >
        <FactionMark faction={faction} size="sm" />
        <span aria-hidden className="truncate">
          {faction.displayName}
        </span>
      </FactionReferenceLink>
    ) : null,
    ...detachmentNames.map((name) => {
      const detachment = faction?.detachments.find((candidate) => candidate.name === name)
      return detachment && detachment.referenceRoute !== null ? (
        <FactionReferenceLink
          key={name}
          to="/factions/$catalogueId/detachments/$detachmentId"
          params={{
            catalogueId: detachment.referenceRoute?.catalogueId ?? faction!.slug,
            detachmentId: detachment.referenceRoute?.slug ?? detachment.slug ?? routeSlug(detachment.name),
          }}
          title={name}
          className="truncate text-bone hover:text-azure"
        >
          {name}
        </FactionReferenceLink>
      ) : (
        <span key={name} className="truncate">
          {name}
        </span>
      )
    }),
  ].filter(Boolean)

  return (
    // A block rather than an inline run, so a side of two armies reads as two lines
    // instead of one sentence with both of them in it.
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-1 text-2xs text-dim', className)}>
      {parts.map((part, at) => (
        // The separator trails what it separates, so a line that wraps starts with a
        // name rather than with a dot belonging to the line above it.
        <span key={part!.key} className="inline-flex min-w-0 items-center gap-1">
          {part}
          {at < parts.length - 1 ? (
            <span aria-hidden className="text-faint">
              ·
            </span>
          ) : null}
        </span>
      ))}
    </span>
  )
}
