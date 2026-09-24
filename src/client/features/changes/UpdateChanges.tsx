import { Link } from '@tanstack/react-router'
import type { LinkedChange, LinkedChangeSet } from '../../../contracts/catalogueChanges'
import { type ChangeSection, changeDetail, changeSection } from '../../catalogueChanges'
import { formatDate, formatTime } from '../../dates'

const SECTIONS: readonly ChangeSection[] = ['Datasheets', 'Detachments', 'Enhancements', 'Upgrades']

/** When an update was recorded. Updates can arrive hourly, so a date alone does not tell two apart. */
export const updateTime = (recordedAt: number) => `${formatDate(recordedAt)} ${formatTime(recordedAt)}`

export const changesLabel = (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`

/**
 * Every change one update records, grouped by faction and then by section, as the body of its
 * row on the index. Each faction's block carries the anchor the row's faction links point to.
 */
export function UpdateChanges({ update }: { update: LinkedChangeSet }) {
  return (
    <div className="space-y-4">
      {update.factions.map((faction) => (
        <div key={faction.catalogueId} id={faction.anchor} data-faction={faction.faction} className="scroll-mt-16">
          <h3 className="eyebrow text-parchment">
            {faction.slug ? (
              <Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} className="hover:text-bone">
                {faction.faction}
              </Link>
            ) : (
              faction.faction
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
    <div className="mt-2">
      <p className="text-3xs font-semibold tracking-label text-faint uppercase">{section}</p>
      <ul className="mt-1 border border-edge bg-panel">
        {changes.map((change) => (
          <li
            key={JSON.stringify(change)}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-edge px-3 py-2 text-sm last:border-b-0"
          >
            <span className="min-w-0 break-words">
              <ChangeName change={change} />
              {'detachment' in change ? <span className="text-xs text-dim"> · {change.detachment}</span> : null}
            </span>
            <span className={`readout text-xs ${change.kind.endsWith('removed') ? 'text-destructive' : 'text-dim'}`}>
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
    <Link
      to="/factions/$catalogueId/datasheets/$entryId"
      params={{ catalogueId: link.faction, entryId: link.slug }}
      className="text-bone hover:text-info"
    >
      {change.name}
    </Link>
  ) : (
    <Link
      to="/factions/$catalogueId/detachments/$detachmentId"
      params={{ catalogueId: link.faction, detachmentId: link.slug }}
      className="text-bone hover:text-info"
    >
      {change.name}
    </Link>
  )
}
