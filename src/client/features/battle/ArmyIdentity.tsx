import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { routeSlug } from '../../../core/slug'
import { factionFor } from '../../factions'
import { factionIndexQuery, factionQuery } from '../../queries'
import { armyRulesRequest } from './sideRules'
import type { Army } from '../../sides'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'

/** Reuse one army identity across setup and battle; frozen lists remain named even when their saved roster no longer exists. */
export function ArmyIdentity({
  army,
  token,
  list = true,
  linked = true,
  className = '',
}: {
  army: Army
  token: string
  /** Whether to name the list too. Off where the list is already the headline above. */
  list?: boolean
  /** Off where the card around it is a control: a link inside a button cannot be pressed. */
  linked?: boolean
  className?: string
}) {
  // One small read for this army's own faction, not the whole catalogue's worth.
  const { data: faction } = useQuery({ ...factionQuery(army.roster?.built?.catalogueId ?? ''), enabled: Boolean(army.roster?.built) })
  const { detachmentNames } = armyRulesRequest(army.roster)

  return (
    <IdentityLine
      faction={faction ?? undefined}
      detachmentNames={detachmentNames}
      trailing={list ? <ArmyLink army={army} token={token} linked={linked} /> : null}
      linked={linked}
      className={className}
    />
  )
}

/**
 * The same line for a list in the library, which knows its detachments by id.
 *
 * Written through the same renderer as a battle's armies, so a list reads the same
 * whether it is being chosen for a seat or already sitting in one.
 */
export function RosterIdentity({
  roster,
  linked = true,
  className = '',
}: {
  roster: { catalogueId: string; detachmentIds: readonly string[] }
  /** Off where the line sits inside a control: a link inside a button steals its press. */
  linked?: boolean
  className?: string
}) {
  const { data: factions } = useQuery(factionIndexQuery())
  const faction = factionFor(factions, roster.catalogueId)
  const detachmentNames = roster.detachmentIds.flatMap((id) => {
    const named = faction?.detachments.find((candidate) => candidate.id === id)
    return named ? [named.name] : []
  })
  return <IdentityLine faction={faction} detachmentNames={detachmentNames} trailing={null} linked={linked} className={className} />
}

type Faction = FactionPresentation & { detachments: { id: string; name: string; slug?: string }[] }

function IdentityLine({
  faction,
  detachmentNames,
  trailing,
  linked,
  className,
}: {
  faction: Faction | undefined
  detachmentNames: readonly string[]
  trailing: ReactNode
  linked: boolean
  className: string
}) {
  const parts = [
    faction ? (
      linked ? (
        <Link
          key="faction"
          to="/factions/$catalogueId"
          params={{ catalogueId: faction.slug }}
          aria-label={`${faction.displayName} faction`}
          title={faction.displayName}
          className="inline-flex min-w-0 items-center gap-1 text-bone hover:text-azure"
        >
          <FactionMark id={faction.slug} icon={faction.icon} size="sm" />
          <span aria-hidden className="truncate">
            {faction.displayName}
          </span>
        </Link>
      ) : (
        <span key="faction" className="inline-flex min-w-0 items-center gap-1 text-bone">
          <FactionMark id={faction.slug} icon={faction.icon} size="sm" />
          <span className="truncate">{faction.displayName}</span>
        </span>
      )
    ) : null,
    ...detachmentNames.map((name) => {
      const detachment = linked ? faction?.detachments.find((candidate) => candidate.name === name) : undefined
      return detachment ? (
        <Link
          key={name}
          to="/factions/$catalogueId/detachments/$detachmentId"
          params={{ catalogueId: faction!.slug, detachmentId: detachment.slug ?? routeSlug(detachment.name) }}
          title={name}
          className="truncate text-bone hover:text-azure"
        >
          {name}
        </Link>
      ) : (
        <span key={name} className="truncate">
          {name}
        </span>
      )
    }),
    trailing ? <span key="trailing">{trailing}</span> : null,
  ].filter(Boolean)

  return (
    // A block rather than an inline run, so a side of two armies reads as two lines
    // instead of one sentence with both of them in it.
    <span className={`flex min-w-0 flex-wrap items-center gap-x-1 text-2xs text-dim ${className}`}>
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

function ArmyLink({ army, token, linked }: { army: Army; token: string; linked: boolean }) {
  if (!army.roster) return <span className="text-faint">No list</span>
  if (!linked) return <span className="truncate">{army.roster.name}</span>
  return (
    <Link
      to="/rosters/$id"
      params={{ id: army.rosterId ?? army.playerId }}
      search={{ battle: token }}
      className="truncate text-bone hover:text-azure"
    >
      {army.roster.name}
    </Link>
  )
}
