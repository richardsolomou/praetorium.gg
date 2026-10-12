import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import type { LinkedChange, LinkedChangeSet } from '../../../contracts/catalogueChanges'
import { type ChangeSection, changeDetail, changeSection } from '../../catalogueChanges'
import { UpdateFactionLabel } from './UpdateFactionLabel'

const SECTIONS: readonly ChangeSection[] = ['Datasheets', 'Detachments', 'Enhancements', 'Upgrades']

export const changesLabel = (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`

/**
 * Every change one update records, grouped by faction and then by section, as the body of its
 * row on the index. Each faction's block carries the anchor the row's faction links point to.
 */
export function UpdateChanges({ update }: { update: LinkedChangeSet }) {
  return (
    <div className="space-y-6">
      {update.factions.map((faction) => (
        <div key={faction.catalogueId} id={faction.anchor} data-faction={faction.faction} className="scroll-mt-16">
          <h3 className="border-b border-edge pb-3 text-base normal-case">
            {faction.slug ? (
              <FactionReferenceLink to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} className="hover:text-bone">
                <UpdateFactionLabel name={faction.faction} />
              </FactionReferenceLink>
            ) : (
              <UpdateFactionLabel name={faction.faction} />
            )}
          </h3>
          {SECTIONS.map((section) => {
            const changes = faction.changes.filter((change) => changeSection(change) === section)
            return changes.length ? <ChangeList key={section} section={section} changes={changes} /> : null
          })}
        </div>
      ))}
      {update.omitted ? (
        <p className="text-xs text-dim">
          {update.omitted} more {update.omitted === 1 ? 'change is' : 'changes are'} not listed.
        </p>
      ) : null}
    </div>
  )
}

function ChangeList({ section, changes }: { section: ChangeSection; changes: LinkedChange[] }) {
  return (
    <div className="mt-4">
      <p className="eyebrow">{section}</p>
      <ul className="mt-2 divide-y divide-edge border border-edge bg-panel">
        {changes.map((change) => (
          <li
            key={JSON.stringify(change)}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3 text-sm sm:px-4"
          >
            <span className="min-w-0 break-words">
              <ChangeName change={change} />
              {'detachment' in change ? <span className="mt-0.5 block text-xs text-dim">{change.detachment}</span> : null}
            </span>
            <span
              className={`readout text-xs ${change.kind.endsWith('removed') ? 'text-destructive' : change.kind.endsWith('added') ? 'text-achieved' : 'text-discarded'}`}
            >
              {changeDetail(change)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChangeName({ change }: { change: LinkedChange }) {
  const { link } = change
  if (!link) return <span className="text-bone">{change.name}</span>
  return link.kind === 'datasheet' ? (
    <FactionReferenceLink
      to="/factions/$catalogueId/datasheets/$entryId"
      params={{ catalogueId: link.faction, entryId: link.slug }}
      className="text-bone hover:text-info"
    >
      {change.name}
    </FactionReferenceLink>
  ) : (
    <FactionReferenceLink
      to="/factions/$catalogueId/detachments/$detachmentId"
      params={{ catalogueId: link.faction, detachmentId: link.slug }}
      className="text-bone hover:text-info"
    >
      {change.name}
    </FactionReferenceLink>
  )
}
