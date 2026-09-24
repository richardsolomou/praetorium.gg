import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import type { LinkedChange, LinkedChangeSet } from '../../../contracts/catalogueChanges'
import { type ChangeSection, changeDetail, changeSection } from '../../catalogueChanges'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { formatDate, formatTime } from '../../dates'
import { catalogueChangeLogQuery } from '../../queries'

const SECTIONS: readonly ChangeSection[] = ['Datasheets', 'Detachments', 'Enhancements', 'Upgrades']

/** What each army data update changed, newest first, grouped by faction. */
export function CatalogueChangesPage() {
  const { data: updates } = useQuery(catalogueChangeLogQuery())

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Reference"
        title="Data updates"
        description="Points, datasheets and detachments that changed each time the army data was updated, newest first."
      />
      <PageContent className="space-y-8">
        {updates?.length ? (
          updates.map((update) => <Update key={update.recordedAt} update={update} />)
        ) : (
          <PageState
            headingLevel={2}
            eyebrow="Data updates"
            title={updates ? 'No updates yet' : 'Loading updates'}
            loading={!updates}
            icon={History}
            explanation={
              updates
                ? 'Nothing has changed since this site started keeping track. The next update that changes points or datasheets appears here.'
                : 'The list of army data updates is loading.'
            }
          />
        )}
      </PageContent>
    </main>
  )
}

function Update({ update }: { update: LinkedChangeSet }) {
  const count = update.factions.reduce((total, faction) => total + faction.changes.length, 0) + update.omitted
  // Updates can arrive hourly, so a date alone does not tell two of them apart.
  const when = `${formatDate(update.recordedAt)} ${formatTime(update.recordedAt)}`
  return (
    <section aria-label={`Update of ${when}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-edge pb-2">
        <h2 className="rubric readout text-bone">{when}</h2>
        <p className="rubric readout">
          {count} {count === 1 ? 'change' : 'changes'}
        </p>
      </div>
      <div className="mt-3 space-y-4">
        {update.factions.map((faction) => (
          <div key={faction.catalogueId} data-faction={faction.faction}>
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
    </section>
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
