import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { factionFor } from '../factions'
import { factionsQuery } from '../queries'
import { armyRulesRequest } from '../sideRules'
import type { Army } from '../sides'
import { FactionMark, type FactionPresentation } from './FactionMark'

/**
 * What one army is: its faction, the detachments it fields, and the list it came
 * from, each a way out to the page about it.
 *
 * Written once because it is read wherever an army is named — the side panel and
 * the scoreboard during a battle, and the armies step and the roster chooser while
 * the table is being set. Copies of this markup meant the faction was a link in one
 * place, a chip in another and plain text in a third.
 *
 * A list the battle does not know the saved id of is still named, because the
 * snapshot in the log is the army whatever became of the list it came from.
 */
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
  const { data: factions } = useQuery(factionsQuery())
  const faction = factionFor(factions, army.roster?.built?.catalogueId ?? '')
  const { detachmentNames } = armyRulesRequest(army.roster)

  return (
    <IdentityLine
      faction={faction}
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
  const { data: factions } = useQuery(factionsQuery())
  const faction = factionFor(factions, roster.catalogueId)
  const detachmentNames = roster.detachmentIds.flatMap((id) => {
    const named = faction?.detachments.find((candidate) => candidate.id === id)
    return named ? [named.name] : []
  })
  return <IdentityLine faction={faction} detachmentNames={detachmentNames} trailing={null} linked={linked} className={className} />
}

type Faction = FactionPresentation & { detachments: { id: string; name: string; slug: string }[] }

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
          params={{ catalogueId: faction!.slug, detachmentId: detachment.slug }}
          title={name}
          className="truncate hover:text-bone hover:underline"
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
    <span className={`flex min-w-0 flex-wrap items-center gap-x-1 text-[0.6875rem] text-dim ${className}`}>
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

/** The list itself, when the battle knows which saved list it was. */
function ArmyLink({ army, token, linked }: { army: Army; token: string; linked: boolean }) {
  if (!army.roster) return <span className="text-faint">No list</span>
  if (!army.rosterId || !linked) return <span className="truncate">{army.roster.name}</span>
  return (
    <Link to="/rosters/$id" params={{ id: army.rosterId }} search={{ battle: token }} className="truncate hover:underline">
      {army.roster.name}
    </Link>
  )
}
