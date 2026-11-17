import { Fragment, useState } from 'react'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import type { LinkedChange, LinkedChangeGroup } from '../../../contracts/catalogueChanges'
import { editionFamilyId } from '../../../core/catalogueEdition'
import { countLabel } from '../../../core/text'
import {
  CHANGE_SECTIONS,
  type ChangeOutcome,
  type ChangeSection,
  changeDetail,
  changeOutcome,
  changeSection,
  pointsRows,
} from '../../catalogueChanges'

/** How many of a section's changes show before the rest wait behind a reveal; one left over shows too, rather than a reveal of one. */
const CHANGE_PEEK = 8

/**
 * Every change one update records, as the body of its row: one block per set of armies that share the same
 * changes, each split by section and set in under its armies. The armies are named on the index, and on an
 * army's page only when its changes differ by version.
 */
export function UpdateChanges({
  groups,
  named,
  omitted,
  marks,
}: {
  groups: LinkedChangeGroup[]
  named: boolean
  omitted: number
  /** Each army's mark by its family id, for those the faction index knows. */
  marks: ReadonlyMap<string, FactionPresentation>
}) {
  const headed = named || groups.length > 1
  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.factions.map((faction) => faction.catalogueId).join()} data-factions={slugsOf(group)}>
          {headed ? <GroupHeading group={group} marks={marks} /> : null}
          <div className={headed ? 'mt-3 space-y-4 pl-9' : 'space-y-4'}>
            {CHANGE_SECTIONS.map((section) => {
              const changes = group.changes.filter((change) => changeSection(change) === section)
              return changes.length ? <ChangeList key={section} section={section} changes={changes} /> : null
            })}
          </div>
        </section>
      ))}
      {omitted ? (
        <p className="text-xs text-dim">
          {omitted} more {omitted === 1 ? 'change is' : 'changes are'} not listed.
        </p>
      ) : null}
    </div>
  )
}

const slugsOf = (group: LinkedChangeGroup) => [...new Set(group.factions.flatMap((faction) => faction.slug ?? []))].join(' ')

/** The armies a block covers, each by its own mark, which falls back to a lozenge in the army's colour. */
function GroupHeading({ group, marks }: { group: LinkedChangeGroup; marks: ReadonlyMap<string, FactionPresentation> }) {
  return (
    <h3 className="flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-base leading-snug font-semibold tracking-normal text-bone normal-case">
      {group.factions.map((faction) => (
        <span key={faction.catalogueId} className="inline-flex items-center gap-2.5">
          <FactionMark
            faction={
              marks.get(editionFamilyId(faction.catalogueId)) ?? {
                slug: faction.slug ?? faction.catalogueId,
                displayName: faction.faction,
                icon: null,
              }
            }
            edition={null}
            className="size-6.5"
          />
          {faction.faction}
        </span>
      ))}
    </h3>
  )
}

/** Each outcome's chip, in the colour the system already gives it: Signal Amber for a price, Map Green added, red removed. */
const OUTCOME_CHIP: Record<ChangeOutcome, { label: string; className: string }> = {
  repriced: { label: 'Points', className: 'border-discarded/50 bg-discarded/10 text-discarded' },
  added: { label: 'Added', className: 'border-achieved/50 bg-achieved/10 text-achieved' },
  removed: { label: 'Removed', className: 'border-destructive/50 bg-destructive/10 text-destructive' },
}

/** One section of a block: its changes, each behind its outcome's chip, the first few showing and the rest on request. */
function ChangeList({ section, changes }: { section: ChangeSection; changes: LinkedChange[] }) {
  const [all, setAll] = useState(false)
  const peek = all || changes.length <= CHANGE_PEEK + 1 ? changes.length : CHANGE_PEEK
  return (
    <div>
      <h4 className="flex items-baseline gap-2 text-xs font-semibold text-dim">
        {section} <span className="figure font-normal text-faint">{changes.length}</span>
      </h4>
      <ul className="mt-1.5 ml-1 border-l border-edge pl-3.5">
        {changes.slice(0, peek).map((change) => (
          <Change key={JSON.stringify(change)} change={change} />
        ))}
      </ul>
      {changes.length > peek ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-0.5 ml-5 rounded-md py-0.5 text-xs font-semibold text-dim underline decoration-runner-hi underline-offset-4 hover:text-bone hover:decoration-bone"
        >
          {countLabel(changes.length - peek, `more ${section.slice(0, -1).toLowerCase()}`, `more ${section.toLowerCase()}`)}
        </button>
      ) : null}
    </div>
  )
}

function Change({ change }: { change: LinkedChange }) {
  const outcome = changeOutcome(change)
  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 py-1 text-sm leading-snug">
      <span className={`chip w-[4.75rem] shrink-0 justify-center ${OUTCOME_CHIP[outcome].className}`}>{OUTCOME_CHIP[outcome].label}</span>
      <span className="min-w-0 break-words">
        <ChangeName change={change} />
        {'detachment' in change ? <span className="text-xs text-dim"> in {change.detachment}</span> : null}
      </span>
      {outcome === 'repriced' ? <PriceChange change={change} /> : null}
    </li>
  )
}

function PriceChange({ change }: { change: LinkedChange }) {
  const lines = change.kind === 'datasheet-points' ? pointsRows(change.rows) : [changeDetail(change)]
  return (
    <span className="readout text-xs text-discarded">
      {lines.map((line, at) => (
        <Fragment key={line}>
          {at ? <span className="text-faint">, </span> : null}
          <span className="whitespace-nowrap">{line}</span>
        </Fragment>
      ))}
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
