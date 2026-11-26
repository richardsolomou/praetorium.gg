import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { BackLink } from '../reference/BackLink'
import { useState, type ReactNode } from 'react'
import type { IndexedUpdate } from '../../../contracts/catalogueChanges'
import { editionFamilyId } from '../../../core/catalogueEdition'
import { CHANGE_SECTIONS, type ChangeOutcome, type ChangeSection, changeOutcome, changeSection, changeTally } from '../../catalogueChanges'
import { factionColour, type FactionPresentation } from '../../components/FactionMark'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { useDateFormatting } from '../../dates'
import { useOpenHashTarget } from '../../hashTarget'
import { catalogueChangeLogQuery, factionIndexQuery } from '../../queries'
import { UpdateChanges } from './UpdateChanges'
import { UpdatesNavigation } from './UpdatesNavigation'
import { DisclosureChevron } from '../../components/DisclosureChevron'

const OUTCOME_VIEWS = [
  [null, 'Everything'],
  ['repriced', 'Points'],
  ['added', 'Added'],
  ['removed', 'Removed'],
] as const satisfies readonly (readonly [ChangeOutcome | null, string])[]

/** The update with only the changes the reader asked to see: one outcome or all, in the picked sections (every section when none is picked). */
function narrow(update: IndexedUpdate, outcome: ChangeOutcome | null, sections: readonly ChangeSection[]): IndexedUpdate {
  if (!outcome && !sections.length) return update
  const groups = update.groups
    .map((group) => ({
      ...group,
      changes: group.changes.filter(
        (change) => (!outcome || changeOutcome(change) === outcome) && (!sections.length || sections.includes(changeSection(change))),
      ),
    }))
    .filter((group) => group.changes.length)
  return { ...update, groups, omitted: 0 }
}

/**
 * Every army data update, or every one that reached a faction, newest first, a page at a time. Each is a
 * dated disclosure saying what it changed, which opens onto every change it recorded; a small update starts
 * open. The reader can narrow the page to one outcome or to some sections, and fold or open every update.
 */
export function CatalogueChangesPage({ before, faction }: { before?: string; faction?: { name: string; slug: string } }) {
  const { data } = useQuery(catalogueChangeLogQuery(before, faction?.slug))
  const { data: index } = useQuery(factionIndexQuery())
  // Every rules version of an army shares its mark, so any of them answers for the family.
  const marks = new Map<string, FactionPresentation>(index?.factions.map((entry) => [editionFamilyId(entry.id), entry]))
  useOpenHashTarget()
  const [outcome, setOutcome] = useState<ChangeOutcome | null>(null)
  const [sections, setSections] = useState<ChangeSection[]>([])
  // Only what the reader changed: an update without an entry follows its own `open`.
  const [opened, setOpened] = useState<ReadonlyMap<string, boolean>>(new Map())
  const updates = data?.updates.map((update) => narrow(update, outcome, sections)).filter((update) => update.groups.length)
  const isOpen = (update: IndexedUpdate) => opened.get(update.anchor) ?? update.open
  const setOpen = (anchor: string, open: boolean) =>
    setOpened((current) => (current.get(anchor) === open ? current : new Map(current).set(anchor, open)))
  const allClosed = !!updates?.length && updates.every((update) => !isOpen(update))
  const filtered = outcome !== null || sections.length > 0

  return (
    <main className="w-full">
      <PageHeader
        tint={faction ? factionColour(faction.slug, faction.name) : undefined}
        title={faction ? `${faction.name} data updates` : 'Data updates'}
        description={
          faction
            ? `Track changes to ${faction.name} points, datasheets and detachments.`
            : 'Follow points changes, new datasheets and detachment updates across every army.'
        }
      >
        <UpdatesNavigation current="data" />
      </PageHeader>
      <PageContent className="sm:pt-6">
        {faction ? (
          <BackLink to="/data-updates" className="mb-4">
            All data updates
          </BackLink>
        ) : null}
        {data?.updates.length ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <nav aria-label="Show" className="no-scrollbar flex min-w-0 overflow-x-auto rounded-lg border border-edge bg-sunken p-0.5">
                {OUTCOME_VIEWS.map(([option, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={outcome === option}
                    onClick={() => setOutcome(option)}
                    className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${outcome === option ? 'bg-raised text-bone' : 'text-dim hover:text-bone'}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <button
                type="button"
                onClick={() => setOpened(new Map(updates?.map((update) => [update.anchor, allClosed])))}
                className="shrink-0 rounded-md py-1 text-xs font-semibold text-dim underline decoration-runner-hi underline-offset-4 hover:text-bone hover:decoration-bone"
              >
                {allClosed ? 'Expand all' : 'Collapse all'}
              </button>
            </div>
            <fieldset className="no-scrollbar -mx-3 mt-3 flex min-w-0 gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
              <legend className="sr-only">Sections</legend>
              {CHANGE_SECTIONS.map((section) => {
                const on = sections.includes(section)
                return (
                  <button
                    key={section}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSections((current) => (on ? current.filter((each) => each !== section) : [...current, section]))}
                    className={`inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                      on ? 'border-bone/50 bg-bone/10 text-bone' : 'border-runner text-dim hover:border-runner-hi hover:text-bone'
                    }`}
                  >
                    {section}
                  </button>
                )
              })}
            </fieldset>
            {updates?.length ? (
              <ol className="mt-6">
                {updates.map((update) => (
                  <Update
                    key={update.anchor}
                    update={update}
                    named={!faction}
                    marks={marks}
                    open={isOpen(update)}
                    onOpenChange={(open) => setOpen(update.anchor, open)}
                  />
                ))}
              </ol>
            ) : (
              <p className="mt-6 text-base text-dim">No changes like that on this page. Pick another filter or show everything.</p>
            )}
          </>
        ) : (
          <PageState
            headingLevel={2}
            title={data ? 'No updates yet' : 'Loading updates'}
            loading={!data}
            icon={History}
            explanation={
              data ? 'Points and datasheet changes appear here after the next data update.' : 'The list of army data updates is loading.'
            }
          />
        )}
        {before || data?.older ? (
          <nav aria-label="Older and newer updates" className="flex justify-between gap-3 border-t border-edge pt-4 text-sm">
            {before ? <PageLink faction={faction}>Newest updates</PageLink> : <span />}
            {data?.older ? (
              <PageLink faction={faction} before={data.older}>
                Older updates
              </PageLink>
            ) : null}
          </nav>
        ) : null}
        {filtered && data?.older ? <p className="mt-2 text-xs text-faint">Filters apply to this page of updates.</p> : null}
      </PageContent>
    </main>
  )
}

/** A link to another page of the same list of updates. */
function PageLink({ faction, before, children }: { faction?: { slug: string }; before?: string; children: ReactNode }) {
  const search = before ? { before } : {}
  const className = 'text-info hover:text-bone'
  return faction ? (
    <Link to="/data-updates/$catalogueId" params={{ catalogueId: faction.slug }} search={search} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/data-updates" search={search} className={className}>
      {children}
    </Link>
  )
}

/** How many armies a row names before counting the rest. */
const NAMED_ARMIES = 4

/** The armies an update reached, by name, with any version qualifier left to its body. */
function armiesLine(update: IndexedUpdate) {
  const names = [...new Set(update.groups.flatMap((group) => group.factions.map((faction) => faction.faction.split(' · ')[0]!)))]
  const named = names.slice(0, NAMED_ARMIES).join(', ')
  return names.length > NAMED_ARMIES ? `${named} and ${names.length - NAMED_ARMIES} more` : named
}

/** One update as a disclosure: its summary names when it landed, the armies it reached and what it did, so most readers never need to open it. */
function Update({
  update,
  named,
  marks,
  open,
  onOpenChange,
}: {
  update: IndexedUpdate
  named: boolean
  marks: ReadonlyMap<string, FactionPresentation>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { date, time } = useDateFormatting()
  const tally = changeTally(update.groups.flatMap((group) => group.changes))
  if (update.omitted) tally.push(`${update.omitted} more`)
  return (
    <li className="border-t border-edge">
      <details
        id={update.anchor}
        open={open}
        onToggle={(event) => onOpenChange(event.currentTarget.open)}
        className="group/update scroll-mt-header"
      >
        <summary className="flex cursor-pointer list-none items-start gap-3 py-6 [&::-webkit-details-marker]:hidden">
          <DisclosureChevron className="mt-1.5" />
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xl leading-none text-bone">
              <time dateTime={new Date(update.recordedAt).toISOString()}>{date(update.recordedAt)}</time>
              <span className="readout font-sans text-xs font-normal text-dim normal-case">{time(update.recordedAt)}</span>
            </h2>
            {named ? <p className="mt-2 text-base text-bone">{armiesLine(update)}</p> : null}
            <p className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-dim">
              {tally.map((part, at) => (
                <span key={part} className="whitespace-nowrap">
                  {at ? '· ' : null}
                  {part}
                </span>
              ))}
            </p>
          </div>
        </summary>
        <div className="pb-10">
          <UpdateChanges groups={update.groups} named={named} omitted={update.omitted} marks={marks} />
        </div>
      </details>
    </li>
  )
}
