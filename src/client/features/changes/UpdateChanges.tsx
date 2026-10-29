import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import type { IndexedUpdate, LinkedChange, LinkedChangeGroup } from '../../../contracts/catalogueChanges'
import {
  CHANGE_OUTCOMES,
  CHANGE_SECTIONS,
  type ChangeSection,
  changeDetail,
  changeOutcome,
  changeSection,
  pointsRows,
} from '../../catalogueChanges'

/**
 * Every change one update records, as the body of its row: one block per set of armies that
 * share the same changes, each split by section. The armies are named on the index, where
 * they link to their own updates, and on an army's page only when its changes differ by version.
 */
export function UpdateChanges({ update, named }: { update: IndexedUpdate; named: boolean }) {
  return (
    <div className="space-y-5">
      {update.groups.map((group) => (
        <section key={group.factions.map((faction) => faction.catalogueId).join()} data-factions={slugsOf(group)}>
          {named || update.groups.length > 1 ? <GroupHeading group={group} linked={named} /> : null}
          <dl className="grid gap-x-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
            {CHANGE_SECTIONS.map((section) => {
              const changes = group.changes.filter((change) => changeSection(change) === section)
              return changes.length ? <ChangeList key={section} section={section} changes={changes} /> : null
            })}
          </dl>
        </section>
      ))}
      {update.omitted ? (
        <p className="text-xs text-dim">
          {update.omitted} more {update.omitted === 1 ? 'change is' : 'changes are'} not listed.
        </p>
      ) : null}
    </div>
  )
}

const slugsOf = (group: LinkedChangeGroup) => [...new Set(group.factions.flatMap((faction) => faction.slug ?? []))].join(' ')

function GroupHeading({ group, linked }: { group: LinkedChangeGroup; linked: boolean }) {
  return (
    <h3 className="mb-1 border-b border-edge pb-1.5 font-sans text-sm leading-relaxed font-semibold normal-case">
      {group.factions.length > 1 ? <span className="eyebrow mr-2">{group.factions.length} armies</span> : null}
      {group.factions.map((faction, at) => (
        <Fragment key={faction.catalogueId}>
          {at ? <span className="text-faint">, </span> : null}
          {linked && faction.slug ? (
            <Link to="/data-updates/$catalogueId" params={{ catalogueId: faction.slug }} className="text-bone hover:text-info">
              {faction.faction}
            </Link>
          ) : (
            <span className="text-bone">{faction.faction}</span>
          )}
        </Fragment>
      ))}
    </h3>
  )
}

const OUTCOME_TONE = { repriced: 'text-discarded', removed: 'text-destructive', added: 'text-achieved' } as const

/** A section's changes under what happened to them, so a row needs only its name, and its price when that moved. */
function ChangeList({ section, changes }: { section: ChangeSection; changes: LinkedChange[] }) {
  return (
    <>
      <dt className="eyebrow pt-2">{section}</dt>
      <dd className="mb-3 space-y-2 pt-1.5 sm:mb-1">
        {CHANGE_OUTCOMES.map((result) => {
          const listed = changes.filter((change) => changeOutcome(change) === result)
          if (!listed.length) return null
          return (
            <div key={result}>
              <p className={`text-xs font-semibold capitalize ${OUTCOME_TONE[result]}`}>
                {result} <span className="readout font-normal text-dim">{listed.length}</span>
              </p>
              <ul className={result === 'repriced' ? 'grid' : 'grid gap-x-6 sm:grid-cols-2'}>
                {listed.map((change) => (
                  <li
                    key={JSON.stringify(change)}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-edge/60 py-1 text-sm leading-snug"
                  >
                    <span className="min-w-0 break-words">
                      <ChangeName change={change} />
                      {'detachment' in change ? <span className="text-xs text-dim"> · {change.detachment}</span> : null}
                    </span>
                    {result === 'repriced' ? <PriceChange change={change} /> : null}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </dd>
    </>
  )
}

function PriceChange({ change }: { change: LinkedChange }) {
  return (
    <span className="readout ml-auto flex flex-col items-end text-xs text-discarded">
      {change.kind === 'datasheet-points' ? pointsRows(change.rows).map((row) => <span key={row}>{row}</span>) : changeDetail(change)}
    </span>
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
