import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Download, ExternalLink, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { facetMatches, facetText, periodBounds, withinPeriod } from '../../../core/listFilter'
import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'
import { routeSlug } from '../../../core/slug'
import { ROSTER_SEARCH_MAX_LENGTH } from '../../../core/rosterDiscovery'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { ungrouped } from '../../components/SearchableSelect'
import { FilterBar, type FilterDimension } from '../../components/FilterBar'
import { NoFilterMatches } from '../../components/NoFilterMatches'
import { useFavouriteFactions } from '../../favouriteFactions'
import { winningList } from '../../functions'
import { factionIndexQuery, gameReferencesQuery, meQuery, type QueryData, winningListsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { facetsOf, periodSearch } from '../../searchParams'
import { countLabel } from '../../text'
import { useClientValue } from '../../useClientValue'
import { useAccountPrompt } from './AccountPrompt'
import { factionSelectGroups } from './builder/factions'
import { CreateRoster } from './CreateRoster'
import { factionFamilies } from './factionFamilies'
import { peekGuestDraft } from './guestDraft'
import { useNewRoster } from './newRoster'
import { RosterImport } from './RosterImport'
import { RosterSummary, rosterTitle, type RosterSummaryFaction } from './RosterSummary'
import { RosterViews } from './RosterViews'
import { openWinningImport } from './winningListImport'
import { WINNING_FACETS, type WinningSearch } from './rosterSearch'

type WinningList = NonNullable<QueryData<typeof winningListsQuery>['lists']>[number]

const SOURCE_URL = 'https://40kstats.tabletopbattles.com/#t4'
const ORDINAL = new Intl.PluralRules('en-GB', { type: 'ordinal' })
const SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' }
export const placingLabel = (placing: number) => `${placing}${SUFFIX[ORDINAL.select(placing)] ?? 'th'}`

const PLACING_GROUPS = ungrouped([1, 2, 3, 4].map((placing) => ({ label: placingLabel(placing), value: String(placing) })))
const PLAYER_BANDS = [
  { value: 'small', label: 'Under 30 players', below: 30 },
  { value: 'medium', label: '30–59 players', below: 60 },
  { value: 'large', label: '60–99 players', below: 100 },
  { value: 'major', label: '100 players or more', below: Infinity },
] as const
const PLAYERS_GROUPS = ungrouped(PLAYER_BANDS.map(({ value, label }) => ({ label, value })))
const playersBand = (players: number | null) =>
  players === null ? 'unknown' : (PLAYER_BANDS.find((band) => players < band.below)?.value ?? 'major')

/** Recent top-four tournament lists that import into a roster with nothing to fix, each opening the import review. */
export function WinningListsPage({ search }: { search: WinningSearch }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const factions = useQuery(factionIndexQuery()).data?.factions ?? []
  const { data: references } = useQuery(gameReferencesQuery())
  const { favourites } = useFavouriteFactions(Boolean(me))
  const result = useQuery(winningListsQuery())
  // Read once, so a period filter does not shift between renders.
  const [now] = useState(() => Date.now())
  const facets = facetsOf(search, WINNING_FACETS)
  const lists = result.data?.lists ?? null

  const families = factionFamilies(factions)
  const factionGroups = factionSelectGroups(
    families.map((faction) => ({ ...faction, id: faction.slug })),
    new Set(families.filter((faction) => favourites.has(faction.id)).map((faction) => faction.slug)),
  )
  // Faction choices are slugs of any rules version; a list matches through its faction family.
  const familyOfSlug = new Map(factions.map((faction) => [faction.slug, currentCatalogueFamilyId(faction.id)]))
  const factionFacet = facets.faction && {
    in: facets.faction.in.flatMap((slug) => familyOfSlug.get(slug) ?? []),
    out: facets.faction.out.flatMap((slug) => familyOfSlug.get(slug) ?? []),
  }
  const read = (lists ?? []).map((list) => {
    const faction = factions.find((entry) => entry.id === list.catalogueId)
    const detachments = list.detachmentIds.flatMap((id) => {
      const name = faction?.detachments.find((entry) => entry.id === id)?.name
      return name ? [{ name, slug: routeSlug(name) }] : []
    })
    return { list, faction, detachments, family: currentCatalogueFamilyId(list.catalogueId) }
  })
  const bounds = periodBounds(search, now)
  const query = search.q?.trim().toLocaleLowerCase()
  const shown = read.filter(
    ({ list, faction, detachments, family }) =>
      facetMatches(factionFacet, [family]) &&
      facetMatches(
        facets.detachment,
        detachments.map((detachment) => detachment.slug),
      ) &&
      facetMatches(facets.disposition, list.disposition ? [list.disposition] : []) &&
      facetMatches(facets.placing, [String(list.placing)]) &&
      facetMatches(facets.players, [playersBand(list.event.players)]) &&
      withinPeriod(Date.parse(list.event.date), bounds) &&
      (!query ||
        [list.name, list.event.name, faction?.displayName ?? '', ...detachments.map((detachment) => detachment.name), ...list.datasheets]
          .join('\n')
          .toLocaleLowerCase()
          .includes(query)),
  )
  // A detachment's choices follow the factions chosen, and one several chapters share is one choice.
  const detachmentChoices = [
    ...new Map(
      read
        .filter(({ family }) => facetMatches(factionFacet, [family]))
        .flatMap(({ detachments }) => detachments.map((detachment) => [detachment.slug, detachment.name] as const)),
    ),
  ]
    .map(([value, label]) => ({ value, label }))
    .toSorted((left, right) => left.label.localeCompare(right.label))
  const dimensions: FilterDimension[] = [
    { key: 'faction', label: 'Faction', groups: factionGroups, pinned: true },
    {
      key: 'detachment',
      label: 'Detachment',
      pinned: true,
      groups: ungrouped(detachmentChoices),
    },
    { key: 'placing', label: 'Placing', pinned: true, groups: PLACING_GROUPS },
    { key: 'players', label: 'Event size', pinned: true, groups: PLAYERS_GROUPS },
    {
      key: 'disposition',
      label: 'Force disposition',
      groups: ungrouped((references?.dispositions ?? []).map((disposition) => ({ label: disposition.name, value: disposition.id }))),
    },
  ]
  // Each choice says how many lists the tab holds under it, whatever else is chosen, as the other roster tabs do.
  const tally = (key: string, valuesOf: (entry: (typeof read)[number]) => readonly string[]) => {
    const counts = new Map<string, number>()
    for (const entry of read) for (const value of new Set(valuesOf(entry))) counts.set(value, (counts.get(value) ?? 0) + 1)
    return [key, counts] as const
  }
  const counts = new Map([
    tally('faction', ({ family }) => [family]),
    tally('detachment', ({ detachments }) => detachments.map((detachment) => detachment.slug)),
    tally('placing', ({ list }) => [String(list.placing)]),
    tally('players', ({ list }) => [playersBand(list.event.players)]),
    tally('disposition', ({ list }) => (list.disposition ? [list.disposition] : [])),
  ])
  const counted = dimensions.map((dimension) => {
    const tallied = counts.get(dimension.key)
    if (!tallied || !lists) return dimension
    const keyOf = (value: string) => (dimension.key === 'faction' ? (familyOfSlug.get(value) ?? value) : value)
    return {
      ...dimension,
      groups: dimension.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item, detail: String(tallied.get(keyOf(item.value)) ?? 0) })),
      })),
    }
  })
  const active = Object.values(search).some(Boolean)
  const choose = (next: WinningSearch) =>
    void navigate({ to: '/rosters', search: { view: 'winning', ...next }, replace: true, resetScroll: false })

  const create = useNewRoster()
  const draft = useClientValue(peekGuestDraft, null)
  const account = useAccountPrompt()
  const another = !me && draft ? () => account.ask('another-roster') : undefined
  const open = useMutation({
    mutationFn: async (list: WinningList) => openWinningImport(navigate, list, (await winningList({ data: { id: list.id } })).text, search),
  })

  return (
    <main className="w-full">
      <PageHeader
        title="Rosters"
        description="Build, import, organize, and share your armies, or find one your friends and other players made public."
        actions={
          <>
            <RosterImport onImport={me ? undefined : create.keepImported} blocked={another} />
            <CreateRoster factionOptions={factions} blocked={another} />
          </>
        }
      >
        <RosterViews view="winning" />
      </PageHeader>
      <PageContent className="space-y-6">
        <FilterBar
          scope="rosters:winning"
          label="List"
          query={search.q ?? ''}
          onQuery={(next) => choose({ ...search, q: next.trim() || undefined })}
          placeholder="Search lists, events, units…"
          maxQueryLength={ROSTER_SEARCH_MAX_LENGTH}
          dimensions={counted}
          value={facets}
          onChange={(key, facet) => choose({ ...search, [key]: facetText(facet) })}
          period={{
            label: 'Played',
            value: periodSearch(search),
            onChange: (next) => choose({ ...search, period: undefined, from: undefined, to: undefined, ...next }),
          }}
          address={search}
          onApply={(next) => choose(next)}
          summary={active && lists ? countLabel(shown.length, 'list') : null}
        />
        {open.isError ? <Problem>Could not open that list: {errorMessage(open.error)}</Problem> : null}
        {create.saveError ? <Problem>{create.saveError}</Problem> : null}
        <section>
          <h2 className="rubric border-b border-edge pb-2">Winning lists</h2>
          <p className="mt-2 text-xs text-dim">
            Top-four lists from recent tournaments, as{' '}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="underline">
              40k Stats
            </a>{' '}
            publishes them. Only lists that import with nothing to fix and are legal under today’s data are shown.
          </p>
          <div className="mt-2 space-y-3">
            {result.isError ? (
              <PageState
                headingLevel={2}
                title="Could not load winning lists"
                explanation="The winning lists could not be loaded. Try again."
                action={
                  <Button variant="outline" onClick={() => void result.refetch()} disabled={result.isFetching}>
                    Try again
                  </Button>
                }
              />
            ) : result.isPending || lists === null ? (
              <PageState
                headingLevel={2}
                title="Checking winning lists"
                explanation="Recent tournament lists are being checked against today’s data. Try again shortly."
                icon={Trophy}
              />
            ) : shown.length ? (
              <div className="runner gap-3 [--gate-x:1rem] [--gate-y:1.5rem] sm:[--gate-x:1.5rem]">
                {shown.map(({ list, faction }) => (
                  <WinningListCard
                    key={list.id}
                    list={list}
                    faction={faction}
                    dispositionName={references?.dispositions.find((entry) => entry.id === list.disposition)?.name}
                    opening={open.isPending && open.variables?.id === list.id}
                    disabled={open.isPending}
                    onImport={another ?? (() => open.mutate(list))}
                  />
                ))}
              </div>
            ) : active ? (
              <NoFilterMatches>No winning lists match these filters</NoFilterMatches>
            ) : (
              <PageState
                headingLevel={2}
                title="No winning lists yet."
                explanation="Recent tournament lists appear here once they import cleanly."
                icon={Trophy}
              />
            )}
          </div>
        </section>
      </PageContent>
      {account.prompt}
    </main>
  )
}

function WinningListCard({
  list,
  faction,
  dispositionName,
  opening,
  disabled,
  onImport,
}: {
  list: WinningList
  faction?: RosterSummaryFaction
  dispositionName?: string
  opening: boolean
  disabled: boolean
  onImport: () => void
}) {
  const roster = { ...list, pointsBudget: null, waivedRules: [], updatedAt: Date.parse(list.event.date) }
  const title = rosterTitle(roster, faction)
  return (
    <article data-winning-list={title} className="part hover:border-runner-hi hover:bg-raised">
      <Link
        to="/rosters/winning/$listId"
        params={{ listId: list.id }}
        state={(state) => ({ ...state, fromWinningLists: true })}
        className="flex min-w-0 p-3"
      >
        <RosterSummary
          roster={roster}
          faction={faction}
          dispositionName={dispositionName}
          points={list.points}
          showLock={false}
          showLegality
          dateLabel="played"
        />
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-edge px-3 py-2 text-xs text-dim">
        <span className="chip shrink-0">{placingLabel(list.placing)}</span>
        <span className="shrink-0">{list.record}</span>
        {list.event.url ? (
          <a href={list.event.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 underline">
            <span className="truncate">{list.event.name}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        ) : (
          <span className="min-w-0 truncate">{list.event.name}</span>
        )}
        {list.event.players ? <span className="shrink-0">{countLabel(list.event.players, 'player')}</span> : null}
        {list.reportedPoints !== null && list.reportedPoints !== list.points ? (
          <span className="shrink-0">was {list.reportedPoints} points</span>
        ) : null}
        <Button variant="outline" size="sm" className="ml-auto" disabled={disabled} onClick={onImport} aria-label={`Import ${title}`}>
          <Download /> {opening ? 'Opening…' : 'Import'}
        </Button>
      </div>
    </article>
  )
}
